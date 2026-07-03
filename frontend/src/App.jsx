import { useEffect, useState } from 'react';
import { getHealth } from './api';

export default function App() {
  const [mode, setMode] = useState('...');

  useEffect(() => {
    getHealth().then((h) => setMode(h.mode)).catch(() => setMode('offline'));
  }, []);

  return (
    <div className="layout">
      <header className="header">
        <h1>🚌 BabaBus</h1>
        <span className="badge">{mode.toUpperCase()} MODE</span>
      </header>
      <aside className="sidebar">
        <h4 style={{ color: 'var(--shopee-yellow)' }}>FAVOURITES</h4>
      </aside>
      <main className="main">
        <p className="muted">Nearby stops will appear here.</p>
      </main>
      <section className="mappane" />
    </div>
  );
}
