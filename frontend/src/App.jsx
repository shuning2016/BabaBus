import { useEffect, useRef, useState } from 'react';
import { addFavourite, addSchedule, deleteFavourite, getArrivals, getFavourites, getHealth, getNearby, getRoute, getSchedules, renameFavourite, search } from './api';
import SearchBar from './components/SearchBar';
import StopCard from './components/StopCard';
import BusMap from './components/BusMap';
import FavouritesPanel from './components/FavouritesPanel';
import AlarmsPanel from './components/AlarmsPanel';
import useWatch from './useWatch';
import useAlarms from './useAlarms';
import { HHMM_RE } from './alarmClock';

const DEFAULT_CENTER = { lat: 1.2975, lon: 103.854 }; // Bugis — demo dataset area
const AUTOWATCH_KEY = 'bababus-autowatch';

// Approximate metres between two lat/lon points (fine at city scale)
const approxMetres = (a, b) => {
  const dLat = (a[0] - b[0]) * 111320;
  const dLon = (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
};

const autoWatchStore = {
  read: () => new Set(JSON.parse(localStorage.getItem(AUTOWATCH_KEY) || '[]')),
  toggle(key) {
    const stored = this.read();
    if (stored.has(key)) stored.delete(key); else stored.add(key);
    localStorage.setItem(AUTOWATCH_KEY, JSON.stringify([...stored]));
  },
};

export default function App() {
  const [mode, setMode] = useState('...');
  const [stops, setStops] = useState([]);
  const [heading, setHeading] = useState('Nearby stops');
  const [mapTarget, setMapTarget] = useState(null);
  const [exploreCenter, setExploreCenter] = useState(null); // [lat, lon] of a user-picked place
  const [favourites, setFavourites] = useState([]);
  const [areaBuses, setAreaBuses] = useState([]); // live buses near the explore view
  const [schedules, setSchedules] = useState([]);
  const { watched, toggleWatch } = useWatch();
  const activeAlarms = useAlarms(schedules);
  const lastLoad = useRef(null); // [lat, lon] of the last nearby fetch

  const refreshFavs = () => getFavourites().then((d) => setFavourites(d.favourites));
  const refreshSchedules = () => getSchedules().then((d) => setSchedules(d.schedules));

  useEffect(() => {
    getHealth().then((h) => setMode(h.mode)).catch(() => setMode('offline'));
    loadNearby();
    refreshFavs();
    refreshSchedules();
  }, []);

  const loadNearby = () => {
    const useCenter = (lat, lon) =>
      getNearby(lat, lon).then((d) => {
        if (d.stops.length === 0 && (lat !== DEFAULT_CENTER.lat)) {
          return useCenter(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon); // demo data fallback
        }
        lastLoad.current = [lat, lon];
        setExploreCenter([lat, lon]);
        setStops(d.stops);
        setHeading('Nearby stops');
        return null;
      });
    if (!navigator.geolocation) return useCenter(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon);
    navigator.geolocation.getCurrentPosition(
      (pos) => useCenter(pos.coords.latitude, pos.coords.longitude),
      () => useCenter(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon)
    );
    return null;
  };

  const onShowBus = (stopId, serviceNo, positions, stopName) =>
    setMapTarget({ type: 'bus', stopId, serviceNo, positions, stopName });

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

  const onShowRoute = (serviceNo) =>
    getRoute(serviceNo)
      .then((route) => setMapTarget({ type: 'route', route }))
      .catch(() => setMapTarget(null));

  const onPickPoint = (lat, lon) => {
    setExploreCenter([lat, lon]);
    lastLoad.current = [lat, lon];
    return getNearby(lat, lon).then((d) => {
      setStops(d.stops);
      setHeading(d.stops.length ? 'Stops near selected point' : 'No stops here');
    });
  };

  const onPickPlace = (place) => {
    setMapTarget(null); // jump back to the explore map
    setExploreCenter([place.lat, place.lon]);
    lastLoad.current = [place.lat, place.lon];
    getNearby(place.lat, place.lon).then((d) => {
      setStops(d.stops);
      setHeading(d.stops.length ? `Stops near ${place.label}` : `No stops near ${place.label}`);
    });
  };

  // Live buses around the explore view: pull arrivals for the visible stops,
  // plot every reported bus position, refresh on the arrivals cadence.
  useEffect(() => {
    if (mapTarget || stops.length === 0) {
      setAreaBuses([]);
      return undefined;
    }
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
          // keep buses roughly within the loaded area so far-off ones don't clutter
          if (!seen.has(key) && (!lastLoad.current || approxMetres([b.lat, b.lon], lastLoad.current) < 2000)) {
            seen.set(key, b);
          }
        });
        setAreaBuses([...seen.values()]);
      });
    load();
    const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [mapTarget, stops]);

  // Panning the explore map loads the stops around the new view automatically.
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
    const group = window.confirm('OK = "Going out"  ·  Cancel = "Coming back"')
      ? 'Going out' : 'Coming back';
    addFavourite({ stop_id: stopObj.id, custom_name: name, group_name: group }).then(refreshFavs);
  };

  const onFavouriteBus = (stopObj, serviceNo) => {
    const name = window.prompt('Name this bus:', `Bus ${serviceNo} @ ${stopObj.name}`);
    if (!name) return;
    addFavourite({
      stop_id: stopObj.id, custom_name: name, group_name: 'My Buses', service_no: serviceNo,
    }).then(refreshFavs);
  };

  const askTime = (message, fallback) => {
    for (;;) {
      const t = window.prompt(message, fallback);
      if (t === null) return null;
      if (HHMM_RE.test(t.trim())) return t.trim();
      fallback = t; // let the user correct their typo
    }
  };

  const onCreateAlarm = (stopObj, serviceNo) => {
    const start = askTime(`Watch bus ${serviceNo} at ${stopObj.name} from (HH:MM):`, '06:40');
    if (!start) return;
    const end = askTime('until (HH:MM):', '07:00');
    if (!end) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    addSchedule({
      stop_id: stopObj.id, service_no: serviceNo,
      start_time: start, end_time: end,
      label: `${serviceNo} @ ${stopObj.name}`,
    }).then(refreshSchedules);
  };

  const openFavouriteBus = (fav) => {
    openFavourite(fav.stop_id);
    getArrivals(fav.stop_id)
      .then((d) => {
        const svc = d.services.find((s) => s.service_no === fav.service_no);
        if (svc) onShowBus(fav.stop_id, fav.service_no, svc.bus_positions, d.stop_name);
      })
      .catch(() => {});
  };

  const toggleAutoWatch = (fav) => {
    autoWatchStore.toggle(`${fav.stop_id}:${fav.service_no}`);
    toggleWatch(fav.stop_id, fav.service_no);
  };

  // Re-arm persisted auto-watches whenever the favourites list loads
  useEffect(() => {
    const stored = autoWatchStore.read();
    favourites
      .filter((f) => f.service_no && stored.has(`${f.stop_id}:${f.service_no}`))
      .forEach((f) => {
        if (!watched(f.stop_id, f.service_no)) toggleWatch(f.stop_id, f.service_no);
      });
  }, [favourites]);

  const openFavourite = (stopId) => {
    const found = stops.find((s) => s.id === stopId);
    if (found) { setStops([found]); setHeading('Favourite'); return; }
    search(stopId).then((r) => {
      if (r.stops.length) { setStops([r.stops[0]]); setHeading('Favourite'); }
    });
  };

  return (
    <div className="layout">
      <header className="header">
        <h1>🚌 BabaBus</h1>
        <SearchBar
          onPickStop={(s) => { setStops([s]); setHeading('Search result'); }}
          onPickService={onShowRoute}
          onPickPlace={onPickPlace}
        />
        <span className="badge">{mode.toUpperCase()} MODE</span>
      </header>
      <aside className="sidebar">
        <h4 style={{ color: 'var(--shopee-yellow)' }}>BUS ALARMS</h4>
        <AlarmsPanel schedules={schedules} active={activeAlarms} onChanged={refreshSchedules} />
        <h4 style={{ color: 'var(--shopee-yellow)' }}>FAVOURITES</h4>
        <FavouritesPanel
          favourites={favourites}
          onOpen={openFavourite}
          onOpenBus={openFavouriteBus}
          onRename={(id) => {
            const name = window.prompt('New name:');
            if (name) renameFavourite(id, name).then(refreshFavs);
          }}
          onDelete={(id) => deleteFavourite(id).then(refreshFavs)}
          watched={watched}
          toggleWatch={toggleAutoWatch}
        />
      </aside>
      <main className="main">
        {activeAlarms.map(({ schedule: s, stopName, etas }) => (
          <div className="alarmbanner" key={s.id}>
            ⏰ Bus <strong>{s.service_no}</strong> at {stopName}:{' '}
            {etas.length
              ? <strong>{etas[0] <= 0 ? 'arriving now' : `${etas[0]} min`}</strong>
              : 'no live timing yet'}
            {etas.length > 1 && <span> · then {etas.slice(1).map((e) => `${e} min`).join(', ')}</span>}
          </div>
        ))}
        <h2 style={{ color: 'var(--navy)', fontSize: 17 }}>
          {heading}{' '}
          <button className="plain" title="Refresh nearby" onClick={loadNearby}>📍</button>
        </h2>
        {stops.map((s) => (
          <StopCard key={s.id} stop={s} onShowBus={onShowBus} onShowRoute={onShowRoute}
            onFavourite={onFavourite} onFavouriteBus={onFavouriteBus} onCreateAlarm={onCreateAlarm}
            watched={watched} toggleWatch={toggleWatch} />
        ))}
      </main>
      <section className="mappane">
        {!mapTarget && (
          <div className="maphint">🖱 Click the map to explore stops there · tap a marker for live arrivals</div>
        )}
        {mapTarget && (
          <button className="mapclose" title="Back to explore map" onClick={() => setMapTarget(null)}>
            ✕ explore
          </button>
        )}
        <BusMap target={mapTarget} stops={stops} buses={areaBuses} onPickPoint={onPickPoint} onMapMove={onMapMove} center={exploreCenter} />
      </section>
      <footer className="footer">
        <span className="dot" />
        {mode === 'demo'
          ? 'DEMO MODE — simulated buses over real Singapore route geometry. Add your LTA DataMall key in backend/.env to go live.'
          : mode === 'live'
            ? 'LIVE MODE — real-time data from LTA DataMall.'
            : 'Backend offline — start the API server on port 8000.'}
      </footer>
    </div>
  );
}
