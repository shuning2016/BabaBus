import { useRef, useState } from 'react';
import { search } from '../api';

export default function SearchBar({ onPickStop, onPickService }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const seq = useRef(0);

  const run = async (value) => {
    setQ(value);
    if (value.trim().length < 1) return setResults(null);
    const mine = ++seq.current;
    try {
      const r = await search(value.trim());
      if (seq.current === mine) setResults(r);
    } catch {
      if (seq.current === mine) setResults(null);
    }
  };

  const close = () => { setResults(null); setQ(''); };

  return (
    <div className="searchwrap">
      <input
        placeholder="Search bus no, stop ID, road, building or postal code…"
        value={q}
        onChange={(e) => run(e.target.value)}
      />
      {results && (
        <div className="results">
          {results.services.map((s) => (
            <div key={`svc-${s}`} onClick={() => { onPickService(s); close(); }}>
              🚌 Bus {s} — view route
            </div>
          ))}
          {results.geocoded && (
            <div className="muted" style={{ cursor: 'default' }}>
              📍 near {results.geocoded.label}
            </div>
          )}
          {results.stops.map((s) => (
            <div key={s.id} onClick={() => { onPickStop(s); close(); }}>
              🚏 {s.name} <span className="muted">({s.id}, {s.road})</span>
            </div>
          ))}
          {!results.services.length && !results.stops.length && (
            <div className="muted" style={{ cursor: 'default' }}>No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
