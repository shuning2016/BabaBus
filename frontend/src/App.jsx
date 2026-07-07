import { useEffect, useRef, useState } from 'react';
import { addFavourite, addSchedule, deleteFavourite, getArrivals, getFavourites, getHealth, getMe, getNearby, getRoute, getSchedules, renameFavourite, reportLocation, signOut } from './api';
import SearchBar from './components/SearchBar';
import StopCard from './components/StopCard';
import BusMap from './components/BusMap';
import FavouritesPanel from './components/FavouritesPanel';
import AlarmsPanel from './components/AlarmsPanel';
import FloatingAlarms from './components/FloatingAlarms';
import NotificationHelp from './components/NotificationHelp';
import AccountButton from './components/AccountButton';
import { deviceId } from './device';
import { sessionToken, setSessionToken } from './session';
import useAlarms from './useAlarms';
import useInstallPrompt from './useInstallPrompt';
import usePush from './usePush';
import { approxMetres, assignBusIds } from './geo';
import { isWithinWindow, minutesNow, toHHMM } from './alarmClock';

const DEFAULT_CENTER = { lat: 1.2975, lon: 103.854 }; // Bugis — demo dataset area

// Favourites/alarms render instantly from the last known copy while the real
// fetch runs — a cold serverless backend takes seconds, and the landing page
// (Favourites) shouldn't sit empty waiting for it.
const readCache = (key) => {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
};
const writeCache = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
};

const TABS = [
  { id: 'fav', icon: '⭐', label: 'Favourite' },
  { id: 'alarms', icon: '⏰', label: 'Alarms' },
  { id: 'map', icon: '🗺️', label: 'Map' },
  { id: 'nearby', icon: '📍', label: 'Nearby' },
];

function PushBanner({ push }) {
  const { status, busy, enable, disable } = push;
  if (status === 'on') {
    return (
      <div className="pushbanner on">
        🔔 Phone alarms are <strong>on</strong> — you'll be reminded even when the app is closed.
        <button className="pill" onClick={disable} disabled={busy}>Turn off</button>
      </div>
    );
  }
  if (status === 'needs-install') {
    return (
      <div className="pushbanner">
        📲 To get alarms when the app is closed, install BabaBus first: tap <strong>Share → Add to Home Screen</strong>,
        then open it from your home screen and enable alarms here.
      </div>
    );
  }
  if (status === 'denied') {
    return <div className="pushbanner">🔕 Notifications are blocked. Allow them for BabaBus in your browser/site settings, then reload.</div>;
  }
  if (status === 'unsupported') {
    return <div className="pushbanner">This browser can't deliver background alarms. Open the installed BabaBus app instead.</div>;
  }
  return (
    <div className="pushbanner">
      🔔 Turn on phone alarms to get reminded even when the app is closed.
      <button className="pill" onClick={enable} disabled={busy}>{busy ? 'Enabling…' : 'Enable phone alarms'}</button>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState('...');
  const [stops, setStops] = useState([]);
  const [heading, setHeading] = useState('Nearby stops');
  const [mapTarget, setMapTarget] = useState(null);
  const [exploreCenter, setExploreCenter] = useState(null);
  const [favourites, setFavourites] = useState(() => readCache('bababus-favs'));
  const [areaBuses, setAreaBuses] = useState([]);
  const [schedules, setSchedules] = useState(() => readCache('bababus-schedules'));
  const [tab, setTab] = useState('fav'); // default page = Favourite
  const [showNotifHelp, setShowNotifHelp] = useState(false);
  const [account, setAccount] = useState(null);
  const activeAlarms = useAlarms(schedules);
  const { canInstall, install } = useInstallPrompt();
  const push = usePush();
  const lastLoad = useRef(null);
  const prevBuses = useRef([]);

  const refreshFavs = () =>
    getFavourites().then((d) => { setFavourites(d.favourites); writeCache('bababus-favs', d.favourites); });
  const refreshSchedules = () =>
    getSchedules().then((d) => { setSchedules(d.schedules); writeCache('bababus-schedules', d.schedules); });

  const onSignedIn = (token, acct) => {
    setSessionToken(token);      // subsequent requests now scope to the account
    setAccount(acct);
    refreshFavs();               // data was migrated server-side — re-fetch it
    refreshSchedules();
  };
  const onSignedOut = () => {
    signOut().catch(() => {});
    setSessionToken(null);
    setAccount(null);
    // drop the account's cached data before re-fetching as the anonymous device
    setFavourites([]); writeCache('bababus-favs', []);
    setSchedules([]); writeCache('bababus-schedules', []);
    refreshFavs();
    refreshSchedules();
  };

  useEffect(() => {
    getHealth().then((h) => setMode(h.mode)).catch(() => setMode('offline'));
    if (sessionToken()) getMe().then((r) => setAccount(r.account)).catch(() => setSessionToken(null));
    loadNearby();
    refreshFavs();
    refreshSchedules();
  }, []);

  // Reopened after a long background (e.g. hours later): re-acquire location and
  // refresh data so the map isn't stuck on the old spot and timings aren't stale.
  // resumeCount kicks the bus-position effects immediately instead of waiting
  // out their 15 s poll interval.
  const [resumeCount, setResumeCount] = useState(0);
  const resumeRef = useRef(() => {});
  resumeRef.current = () => {
    refreshFavs();
    refreshSchedules();
    setResumeCount((c) => c + 1);
    if (!mapTarget) loadNearby(); // re-locate + refresh nearby (map re-centers)
  };
  useEffect(() => {
    let hiddenAt = null;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = null;
      if (away >= 20000) resumeRef.current(); // ignore brief app-switches
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const loadNearby = () => {
    const loadAt = (lat, lon) =>
      getNearby(lat, lon).then((d) => {
        if (d.stops.length === 0 && lat !== DEFAULT_CENTER.lat) {
          return loadAt(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon);
        }
        lastLoad.current = [lat, lon];
        setExploreCenter([lat, lon]);
        setStops(d.stops);
        setHeading('Nearby stops');
        return null;
      });
    // Paint instantly from the last remembered position (cold starts otherwise
    // stare at nothing for the seconds a fresh GPS lock takes), then re-center
    // once the real fix lands — but only if the user actually moved.
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('bababus-last-pos')); } catch { /* ignore */ }
    if (cached?.lat) loadAt(cached.lat, cached.lon);
    if (!navigator.geolocation) return cached?.lat ? null : loadAt(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        try { localStorage.setItem('bababus-last-pos', JSON.stringify({ lat, lon })); } catch { /* ignore */ }
        // share the fix so alarm pushes can say which bus is catchable from here
        reportLocation(lat, lon).catch(() => {});
        if (!cached?.lat || approxMetres([lat, lon], [cached.lat, cached.lon]) > 150) loadAt(lat, lon);
      },
      () => { if (!cached?.lat) loadAt(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon); },
      // a slightly stale fix beats waiting: don't stall the map for a fresh lock
      { maximumAge: 60000, timeout: 8000 }
    );
    return null;
  };

  const showOnMap = (t) => { setMapTarget(t); setTab('map'); };
  const onShowBus = (stopId, serviceNo, positions, stopName) =>
    showOnMap({ type: 'bus', stopId, serviceNo, positions, stopName });
  const onShowRoute = (serviceNo) =>
    getRoute(serviceNo).then((route) => showOnMap({ type: 'route', route })).catch(() => {});

  useEffect(() => {
    if (!mapTarget || mapTarget.type !== 'bus') return undefined;
    const load = () => {
      getArrivals(mapTarget.stopId)
        .then((d) => {
          const svc = d.services.find((s) => s.service_no === mapTarget.serviceNo);
          if (svc) {
            setMapTarget((prev) =>
              prev && prev.type === 'bus' && prev.stopId === mapTarget.stopId && prev.serviceNo === mapTarget.serviceNo
                ? { ...prev, positions: svc.bus_positions }
                : prev
            );
          }
        })
        .catch(() => {});
    };
    if (resumeCount > 0) load(); // reopened — refresh the position right away
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [mapTarget?.type, mapTarget?.stopId, mapTarget?.serviceNo, resumeCount]);

  const onPickPoint = (lat, lon) => {
    setExploreCenter([lat, lon]);
    setHeading('Loading stops…');
    lastLoad.current = [lat, lon];
    return getNearby(lat, lon).then((d) => {
      setStops(d.stops);
      setHeading(d.stops.length ? 'Stops near selected point' : 'No stops here');
    });
  };

  const onPickPlace = (place) => {
    setMapTarget(null);
    setExploreCenter([place.lat, place.lon]);
    setTab('map');
    setHeading(`Loading stops near ${place.label}…`);
    lastLoad.current = [place.lat, place.lon];
    getNearby(place.lat, place.lon).then((d) => {
      setStops(d.stops);
      setHeading(d.stops.length ? `Stops near ${place.label}` : `No stops near ${place.label}`);
    });
  };

  // Live buses around the explore view, with stable ids so the map can animate them.
  useEffect(() => {
    if (mapTarget || stops.length === 0) { setAreaBuses([]); prevBuses.current = []; return undefined; }
    let alive = true;
    const load = () =>
      Promise.all(
        stops.slice(0, 8).map((s) =>
          getArrivals(s.id)
            .then((d) => d.services.flatMap((svc) =>
              svc.bus_positions.map((p) => ({ ...p, service_no: svc.service_no, toward: d.stop_name }))))
            .catch(() => [])
        )
      ).then((lists) => {
        if (!alive) return;
        const seen = new Map();
        lists.flat().forEach((b) => {
          const key = `${b.service_no}:${b.lat.toFixed(3)}:${b.lon.toFixed(3)}`;
          if (!seen.has(key) && (!lastLoad.current || approxMetres([b.lat, b.lon], lastLoad.current) < 2000)) {
            seen.set(key, b);
          }
        });
        const withIds = assignBusIds(prevBuses.current, [...seen.values()]);
        prevBuses.current = withIds;
        setAreaBuses(withIds);
      });
    load();
    // Markers only start moving on the SECOND sample — pull it in early so
    // buses don't sit frozen for a full poll interval after first paint.
    // 8.5 s clears the server's 8 s arrivals cache, so this sample is fresh.
    const kick = setTimeout(load, 8500);
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearTimeout(kick); clearInterval(timer); };
  }, [mapTarget, stops, resumeCount]);

  const onMapMove = (lat, lon) => {
    if (lastLoad.current && approxMetres([lat, lon], lastLoad.current) < 200) return;
    lastLoad.current = [lat, lon];
    getNearby(lat, lon).then((d) => {
      setStops(d.stops);
      setHeading(d.stops.length ? 'Stops in this area' : 'No stops in this area');
    });
  };

  const onFavourite = (stopObj) => {
    const name = window.prompt('Name this stop:', stopObj.name);
    if (!name) return;
    const group = window.confirm('OK = "Going out"  ·  Cancel = "Coming back"') ? 'Going out' : 'Coming back';
    addFavourite({ stop_id: stopObj.id, custom_name: name, group_name: group }).then(refreshFavs);
  };

  // "My watching buses" = bus favourites (My Buses). Chip clicks toggle membership.
  const watchKey = (stopId, serviceNo) => `${stopId}:${serviceNo}`;
  const busFavs = favourites.filter((f) => f.service_no);
  const watchedBuses = new Set(busFavs.map((f) => watchKey(f.stop_id, f.service_no)));
  const watchedIds = new Map(busFavs.map((f) => [watchKey(f.stop_id, f.service_no), f.id]));

  // Optimistic: flip the chip instantly, sync with the server behind it (the
  // round-trip made taps feel laggy). refreshFavs reconciles either way.
  const onToggleWatchBus = (stopId, stopName, serviceNo) => {
    const key = watchKey(stopId, serviceNo);
    if (watchedBuses.has(key)) {
      const id = watchedIds.get(key);
      if (typeof id === 'string') return Promise.resolve(); // still saving — ignore the re-tap
      setFavourites((cur) => cur.filter((f) => f.id !== id));
      return deleteFavourite(id).then(refreshFavs, refreshFavs);
    }
    const body = {
      stop_id: stopId, custom_name: `${serviceNo} @ ${stopName}`,
      group_name: 'My Buses', service_no: serviceNo,
    };
    setFavourites((cur) => [...cur, { id: `tmp-${key}`, ...body }]);
    return addFavourite(body).then(refreshFavs, refreshFavs);
  };

  const requestNotif = () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
  };

  // Station alarm (stop → time slot → buses), created from a stop's ⏰ form
  const onCreateStationAlarm = (payload) => {
    requestNotif();
    return addSchedule(payload).then(() => { refreshSchedules(); setTab('alarms'); });
  };

  // 🔔 quick alarm: monitor one bus at a stop from now to +30 min. The floating
  // widget appears immediately (the window is active), so no tab switch.
  const quickAlarm = (serviceNo, stopId, stopName) => {
    const now = minutesNow();
    const dup = schedules.find((s) =>
      s.enabled && s.stop_id === stopId && s.services.length === 1 &&
      s.services[0] === serviceNo && isWithinWindow(now, s.start_time, s.end_time));
    if (dup) return Promise.resolve(); // already watching this bus here right now
    requestNotif();
    return addSchedule({
      stop_id: stopId, services: [serviceNo],
      start_time: toHHMM(now), end_time: toHHMM(now + 30),
      label: `${serviceNo} @ ${stopName}`,
    }).then(refreshSchedules);
  };

  // 🔔 on a map bus marker: alarm at the station nearest the bus's position
  const quickAlarmAtBus = (bus) =>
    getNearby(bus.lat, bus.lon).then((d) => {
      if (d.stops.length) return quickAlarm(bus.service_no, d.stops[0].id, d.stops[0].name);
      return null;
    }).catch(() => {});

  // From a map stop popup: jump to the stop's card with the alarm form open
  const [alarmStopId, setAlarmStopId] = useState(null);
  const onAlarmStop = (stop) => {
    setStops([stop]);
    setHeading(stop.name);
    setAlarmStopId(stop.id);
    setTab('nearby');
  };

  const renameFav = (id) => {
    const name = window.prompt('New name:');
    if (name) renameFavourite(id, name).then(refreshFavs);
  };

  // Remove an implicit "My Buses" stop by un-watching every bus watched there.
  // Skip optimistic tmp- entries that haven't been saved server-side yet.
  const removeWatchedStop = (stopId) => {
    const ids = favourites
      .filter((f) => f.stop_id === stopId && f.service_no && typeof f.id === 'number')
      .map((f) => f.id);
    Promise.all(ids.map((id) => deleteFavourite(id))).then(refreshFavs, refreshFavs);
  };

  return (
    <div className={`app tab-${tab}`}>
      {showNotifHelp && <NotificationHelp onClose={() => setShowNotifHelp(false)} />}
      <FloatingAlarms active={activeAlarms} onOpenAlarms={() => setTab('alarms')} />
      <header className="header">
        <h1>🚌 BabaBus</h1>
        <SearchBar
          onPickStop={(s) => { setStops([s]); setHeading('Search result'); setTab('nearby'); }}
          onPickService={onShowRoute}
          onPickPlace={onPickPlace}
        />
        {canInstall && <button className="installbtn" onClick={install}>⬇ Install</button>}
        <AccountButton deviceId={deviceId()} mode={mode} account={account} onSignedIn={onSignedIn} onSignedOut={onSignedOut} />
      </header>

      <div className="content">
        <section className="pane pane-fav">
          <FavouritesPanel
            favourites={favourites}
            onShowBus={onShowBus} onShowRoute={onShowRoute}
            watchedBuses={watchedBuses} onToggleWatchBus={onToggleWatchBus}
            onCreateStationAlarm={onCreateStationAlarm} onQuickAlarm={quickAlarm}
            onRename={renameFav} onDelete={(id) => deleteFavourite(id).then(refreshFavs)}
            onRemoveStop={removeWatchedStop}
          />
        </section>

        <section className="pane pane-alarms">
          <div className="paneheader">
            <h2>Bus Alarms</h2>
          </div>
          <PushBanner push={push} />
          <button className="linkbtn notifhelp" onClick={() => setShowNotifHelp(true)}>
            🔔 通知没弹出？点这里设置手机 · Alarm not popping up?
          </button>
          <AlarmsPanel schedules={schedules} active={activeAlarms} onChanged={refreshSchedules} />
        </section>

        <section className="pane pane-map">
          {mapTarget && (
            <button className="mapclose" onClick={() => setMapTarget(null)}>✕ back to explore</button>
          )}
          <BusMap target={mapTarget} stops={stops} buses={areaBuses} active={tab === 'map'}
            onPickPoint={onPickPoint} onMapMove={onMapMove} onAlarmStop={onAlarmStop}
            watchedBuses={watchedBuses} onToggleWatchBus={onToggleWatchBus}
            onQuickAlarm={quickAlarm} onQuickAlarmBus={quickAlarmAtBus} center={exploreCenter} />
        </section>

        <section className="pane pane-nearby">
          <div className="paneheader">
            <h2>{heading}</h2>
            <button className="pill" onClick={loadNearby}>📍 Near me</button>
          </div>
          {stops.map((s) => (
            <StopCard key={s.id} stop={s} onShowBus={onShowBus} onShowRoute={onShowRoute}
              onFavourite={onFavourite}
              watchedBuses={watchedBuses} onToggleWatchBus={onToggleWatchBus}
              onCreateStationAlarm={onCreateStationAlarm} onQuickAlarm={quickAlarm}
              autoAlarm={alarmStopId === s.id} onAutoAlarmHandled={() => setAlarmStopId(null)} />
          ))}
        </section>
      </div>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="ti">{t.icon}</span><span className="tl">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
