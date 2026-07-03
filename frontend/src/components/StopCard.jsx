import { useEffect, useState } from 'react';
import { getArrivals } from '../api';
import ArrivalRow from './ArrivalRow';

const POLL_MS = 15000;

export default function StopCard({
  stop, onShowBus, onShowRoute, onFavourite, onFavouriteBus, onCreateAlarm,
  watched, toggleWatch, defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const load = () =>
      getArrivals(stop.id)
        .then((d) => alive && (setData(d), setError(null)))
        .catch((e) => alive && setError(e.message));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [open, stop.id]);

  return (
    <div className="card">
      <div className="cardhead">
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setOpen(!open)}>
          <h3>{stop.name}</h3>
          <span className="muted">
            {stop.id} · {stop.road}
            {stop.distance_m != null && ` · ${stop.distance_m} m away`}
          </span>
        </div>
        <button className="plain" title="Add stop to Favourites" onClick={() => onFavourite(stop)}>⭐</button>
        <button className="plain caret" onClick={() => setOpen(!open)}>{open ? '▲' : '▼'}</button>
      </div>
      {open && error && <p className="stale">{error}</p>}
      {open && data && (
        <>
          {data.stale && <p className="stale">⚠ showing last known timings</p>}
          {data.services.map((svc) => (
            <ArrivalRow key={svc.service_no} svc={svc} stopId={stop.id} stopName={data.stop_name}
              onShowBus={onShowBus} onShowRoute={onShowRoute}
              onFavouriteBus={onFavouriteBus} onCreateAlarm={onCreateAlarm}
              watched={watched} toggleWatch={toggleWatch} />
          ))}
        </>
      )}
    </div>
  );
}
