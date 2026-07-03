import { useEffect, useState } from 'react';
import { addFavourite, deleteFavourite, getArrivals, getFavourites, getHealth, getNearby, getRoute, renameFavourite, search } from './api';
import SearchBar from './components/SearchBar';
import StopCard from './components/StopCard';
import BusMap from './components/BusMap';
import FavouritesPanel from './components/FavouritesPanel';
import useWatch from './useWatch';

const DEFAULT_CENTER = { lat: 1.2975, lon: 103.854 }; // Bugis — demo dataset area

export default function App() {
  const [mode, setMode] = useState('...');
  const [stops, setStops] = useState([]);
  const [heading, setHeading] = useState('Nearby stops');
  const [mapTarget, setMapTarget] = useState(null);
  const [favourites, setFavourites] = useState([]);
  const { watched, toggleWatch } = useWatch();

  const refreshFavs = () => getFavourites().then((d) => setFavourites(d.favourites));

  useEffect(() => {
    getHealth().then((h) => setMode(h.mode)).catch(() => setMode('offline'));
    loadNearby();
    refreshFavs();
  }, []);

  const loadNearby = () => {
    const useCenter = (lat, lon) =>
      getNearby(lat, lon).then((d) => {
        if (d.stops.length === 0 && (lat !== DEFAULT_CENTER.lat)) {
          return useCenter(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon); // demo data fallback
        }
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

  const onFavourite = (stopObj) => {
    const name = window.prompt('Name this stop:', stopObj.name);
    if (!name) return;
    const group = window.confirm('OK = "Going out"  ·  Cancel = "Coming back"')
      ? 'Going out' : 'Coming back';
    addFavourite({ stop_id: stopObj.id, custom_name: name, group_name: group }).then(refreshFavs);
  };

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
        />
        <span className="badge">{mode.toUpperCase()} MODE</span>
      </header>
      <aside className="sidebar">
        <h4 style={{ color: 'var(--shopee-yellow)' }}>FAVOURITES</h4>
        <FavouritesPanel
          favourites={favourites}
          onOpen={openFavourite}
          onRename={(id) => {
            const name = window.prompt('New name:');
            if (name) renameFavourite(id, name).then(refreshFavs);
          }}
          onDelete={(id) => deleteFavourite(id).then(refreshFavs)}
        />
      </aside>
      <main className="main">
        <h2 style={{ color: 'var(--navy)', fontSize: 17 }}>
          {heading}{' '}
          <button className="plain" title="Refresh nearby" onClick={loadNearby}>📍</button>
        </h2>
        {stops.map((s) => (
          <StopCard key={s.id} stop={s} onShowBus={onShowBus} onShowRoute={onShowRoute}
            onFavourite={onFavourite} watched={watched} toggleWatch={toggleWatch} />
        ))}
      </main>
      <section className="mappane">
        <BusMap target={mapTarget} />
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
