import { useEffect, useRef, useState } from 'react';
import { addFavourite, addSchedule, deleteFavourite, getArrivals, getFavourites, getHealth, getNearby, getRoute, getSchedules, renameFavourite } from './api';
import SearchBar from './components/SearchBar';
import StopCard from './components/StopCard';
import BusMap from './components/BusMap';
import FavouritesPanel from './components/FavouritesPanel';
import AlarmsPanel from './components/AlarmsPanel';
import useWatch from './useWatch';
import useAlarms from './useAlarms';
import useInstallPrompt from './useInstallPrompt';
import usePush from './usePush';
import { HHMM_RE } from './alarmClock';
import { approxMetres, assignBusIds } from './geo';

const DEFAULT_CENTER = { lat: 1.2975, lon: 103.854 }; // Bugis — demo dataset area
const AUTOWATCH_KEY = 'bababus-autowatch';

const autoWatchStore = {
  read: () => new Set(JSON.parse(localStorage.getItem(AUTOWATCH_KEY) || '[]')),
  toggle(key) {
    const stored = this.read();
    if (stored.has(key)) stored.delete(key); else stored.add(key);
    localStorage.setItem(AUTOWATCH_KEY, JSON.stringify([...stored]));
  },
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
  const [favourites, setFavourites] = useState([]);
  const [areaBuses, setAreaBuses] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [tab, setTab] = useState('fav'); // default page = Favourite
  const { watched, toggleWatch } = useWatch();
  const activeAlarms = useAlarms(schedules);
  const { canInstall, install } = useInstallPrompt();
  const push = usePush();
  const lastLoad = useRef(null);
  const prevBuses = useRef([]);

  const refreshFavs = () => getFavourites().then((d) => setFavourites(d.favourites));
  const refreshSchedules = () => getSchedules().then((d) => setSchedules(d.schedules));

  useEffect(() => {
    getHealth().then((h) => setMode(h.mode)).catch(() => setMode('offline'));
    loadNearby();
    refreshFavs();
    refreshSchedules();
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
    if (!navigator.geolocation) return loadAt(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon);
    navigator.geolocation.getCurrentPosition(
      (pos) => loadAt(pos.coords.latitude, pos.coords.longitude),
      () => loadAt(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon)
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
    const timer = setInterval(() => {
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
    }, 15000);
    return () => clearInterval(timer);
  }, [mapTarget?.type, mapTarget?.stopId, mapTarget?.serviceNo]);

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
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [mapTarget, stops]);

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

  const onFavouriteBus = (stopObj, serviceNo) => {
    const name = window.prompt('Name this bus:', `Bus ${serviceNo} @ ${stopObj.name}`);
    if (!name) return;
    addFavourite({ stop_id: stopObj.id, custom_name: name, group_name: 'My Buses', service_no: serviceNo }).then(refreshFavs);
  };

  const askTime = (message, fallback) => {
    for (;;) {
      const t = window.prompt(message, fallback);
      if (t === null) return null;
      if (HHMM_RE.test(t.trim())) return t.trim();
      fallback = t;
    }
  };

  const onCreateAlarm = (stopObj, serviceNo) => {
    const start = askTime(`Watch bus ${serviceNo} at ${stopObj.name} from (HH:MM):`, '06:40');
    if (!start) return;
    const end = askTime('until (HH:MM):', '07:00');
    if (!end) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    addSchedule({ stop_id: stopObj.id, service_no: serviceNo, start_time: start, end_time: end, label: `${serviceNo} @ ${stopObj.name}` }).then(refreshSchedules);
  };

  const toggleAutoWatch = (fav) => {
    autoWatchStore.toggle(`${fav.stop_id}:${fav.service_no}`);
    toggleWatch(fav.stop_id, fav.service_no);
  };

  useEffect(() => {
    const stored = autoWatchStore.read();
    favourites
      .filter((f) => f.service_no && stored.has(`${f.stop_id}:${f.service_no}`))
      .forEach((f) => { if (!watched(f.stop_id, f.service_no)) toggleWatch(f.stop_id, f.service_no); });
  }, [favourites]);

  const renameFav = (id) => {
    const name = window.prompt('New name:');
    if (name) renameFavourite(id, name).then(refreshFavs);
  };

  const AlarmBanners = () => activeAlarms.map(({ schedule: s, stopName, etas }) => (
    <div className="alarmbanner" key={s.id}>
      ⏰ Bus <strong>{s.service_no}</strong> at {stopName}:{' '}
      {etas.length ? <strong>{etas[0] <= 0 ? 'arriving now' : `${etas[0]} min`}</strong> : 'no live timing yet'}
      {etas.length > 1 && <span> · then {etas.slice(1).map((e) => `${e} min`).join(', ')}</span>}
    </div>
  ));

  return (
    <div className={`app tab-${tab}`}>
      <header className="header">
        <h1>🚌 BabaBus</h1>
        <SearchBar
          onPickStop={(s) => { setStops([s]); setHeading('Search result'); setTab('nearby'); }}
          onPickService={onShowRoute}
          onPickPlace={onPickPlace}
        />
        {canInstall && <button className="installbtn" onClick={install}>⬇ Install</button>}
        <span className={`badge ${mode}`}>{mode.toUpperCase()}</span>
      </header>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="ti">{t.icon}</span><span className="tl">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="content">
        <section className="pane pane-fav">
          <AlarmBanners />
          <FavouritesPanel
            favourites={favourites}
            onShowBus={onShowBus} onShowRoute={onShowRoute} onCreateAlarm={onCreateAlarm}
            onRename={renameFav} onDelete={(id) => deleteFavourite(id).then(refreshFavs)}
            watched={watched} toggleWatch={toggleAutoWatch}
          />
        </section>

        <section className="pane pane-alarms">
          <div className="paneheader">
            <h2>Bus Alarms</h2>
          </div>
          <PushBanner push={push} />
          <AlarmsPanel schedules={schedules} active={activeAlarms} onChanged={refreshSchedules} />
        </section>

        <section className="pane pane-map">
          {mapTarget && (
            <button className="mapclose" onClick={() => setMapTarget(null)}>✕ back to explore</button>
          )}
          <BusMap target={mapTarget} stops={stops} buses={areaBuses} active={tab === 'map'}
            onPickPoint={onPickPoint} onMapMove={onMapMove} center={exploreCenter} />
        </section>

        <section className="pane pane-nearby">
          <AlarmBanners />
          <div className="paneheader">
            <h2>{heading}</h2>
            <button className="pill" onClick={loadNearby}>📍 Near me</button>
          </div>
          {stops.map((s) => (
            <StopCard key={s.id} stop={s} onShowBus={onShowBus} onShowRoute={onShowRoute}
              onFavourite={onFavourite} onFavouriteBus={onFavouriteBus} onCreateAlarm={onCreateAlarm}
              watched={watched} toggleWatch={toggleWatch} />
          ))}
        </section>
      </div>
    </div>
  );
}
