import { useRef, useState } from 'react';
import { search } from '../api';

const RECENT_KEY = 'bababus-recent';
const RECENT_MAX = 5;

const readRecent = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch { return []; }
};
const pushRecent = (item) => {
  const next = [item, ...readRecent().filter((r) => r.label !== item.label)].slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
};

export default function SearchBar({ onPickStop, onPickService, onPickPlace }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState(readRecent);
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

  const close = () => { setResults(null); setQ(''); setFocused(false); };

  const remember = (item) => setRecent(pushRecent(item));

  const pickService = (s) => { remember({ kind: 'service', label: `Bus ${s}`, value: s }); onPickService(s); close(); };
  const pickPlace = (p) => { remember({ kind: 'place', label: p.label, value: p }); onPickPlace(p); close(); };
  const pickStop = (s) => { remember({ kind: 'stop', label: s.name, value: s }); onPickStop(s); close(); };

  const replayRecent = (r) => {
    if (r.kind === 'service') return pickService(r.value);
    if (r.kind === 'place') return pickPlace(r.value);
    return pickStop(r.value);
  };

  const showRecent = focused && q.trim().length === 0 && recent.length > 0;
  const icon = { service: '🚌', place: '📍', stop: '🚏' };

  return (
    <div className="searchwrap">
      <span className="searchicon">🔍</span>
      <input
        placeholder="Search bus, stop, road or postal code"
        value={q}
        onChange={(e) => run(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {q && <button className="searchclear" onMouseDown={(e) => e.preventDefault()} onClick={close}>✕</button>}

      {showRecent && (
        <div className="results">
          <div className="results-label">Recent</div>
          {recent.map((r, i) => (
            <div key={i} className="result-row" onMouseDown={() => replayRecent(r)}>
              <span className="result-ic">{icon[r.kind]}</span>{r.label}
            </div>
          ))}
        </div>
      )}

      {q && results && (
        <div className="results">
          {results.services.map((s) => (
            <div key={`svc-${s}`} className="result-row" onMouseDown={() => pickService(s)}>
              <span className="result-ic">🚌</span>Bus <strong>{s}</strong> — view route
            </div>
          ))}
          {results.geocoded && (
            <div className="result-row" onMouseDown={() => pickPlace(results.geocoded)}>
              <span className="result-ic">📍</span>Go to <strong>{results.geocoded.label}</strong>
            </div>
          )}
          {results.stops.map((s) => (
            <div key={s.id} className="result-row" onMouseDown={() => pickStop(s)}>
              <span className="result-ic">🚏</span>{s.name} <span className="muted">({s.id}, {s.road})</span>
            </div>
          ))}
          {!results.services.length && !results.stops.length && !results.geocoded && (
            <div className="result-row muted" style={{ cursor: 'default' }}>No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
