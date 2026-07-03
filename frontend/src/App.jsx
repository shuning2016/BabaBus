import { useEffect, useState } from 'react';
import { getHealth, getNearby, getRoute } from './api';
import SearchBar from './components/SearchBar';
import StopCard from './components/StopCard';
import BusMap from './components/BusMap';

const DEFAULT_CENTER = { lat: 1.2975, lon: 103.854 }; // Bugis — demo dataset area

export default function App() {
  const [mode, setMode] = useState('...');
  const [stops, setStops] = useState([]);
  const [heading, setHeading] = useState('Nearby stops');
  const [mapTarget, setMapTarget] = useState(null);

  useEffect(() => {
    getHealth().then((h) => setMode(h.mode)).catch(() => setMode('offline'));
    loadNearby();
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

  const onShowBus = (serviceNo, positions, stopName) =>
    setMapTarget({ type: 'bus', serviceNo, positions, stopName });

  const onShowRoute = (serviceNo) =>
    getRoute(serviceNo)
      .then((route) => setMapTarget({ type: 'route', route }))
      .catch(() => setMapTarget(null));

  // Placeholders — real implementations arrive in Task 11:
  const onFavourite = () => {};
  const watched = () => false;
  const toggleWatch = () => {};

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
    </div>
  );
}
