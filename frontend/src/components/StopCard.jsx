import { useEffect, useState } from 'react';
import { getArrivals } from '../api';
import CapacityBar from './CapacityBar';

const POLL_MS = 15000;

export default function StopCard({
  stop, onShowBus, onShowRoute, onFavourite, onFavouriteBus, watched, toggleWatch, defaultOpen = false,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setOpen(!open)}>
          <h3>{stop.name} <span className="muted">{stop.id} · {stop.road}</span></h3>
          {stop.distance_m != null && <span className="muted">{stop.distance_m} m away</span>}
        </div>
        <button className="plain" title="Add to favourites" onClick={() => onFavourite(stop)}>⭐</button>
        <button className="plain" onClick={() => setOpen(!open)}>{open ? '▲' : '▼'}</button>
      </div>
      {open && error && <p className="stale">{error}</p>}
      {open && data && (
        <>
          {data.stale && <p className="stale">⚠ showing last known timings</p>}
          {data.services.map((svc) => (
            <div className="row" key={svc.service_no}>
              <button className="plain svc-chip" title="View route"
                onClick={() => onShowRoute(svc.service_no)}>
                {svc.service_no}
              </button>
              {svc.etas.map((eta, i) => (
                <span key={i} className={`eta ${eta <= 1 ? 'now' : ''}`}
                  title="Show bus on map"
                  onClick={() => onShowBus(stop.id, svc.service_no, svc.bus_positions, data.stop_name)}>
                  {eta <= 0 ? 'Arr' : `${eta} min`}
                </span>
              ))}
              <CapacityBar load={svc.load} />
              <span className="muted" title="Interval since previous bus">
                every ~{svc.prev_interval_min} min
              </span>
              <button className="plain" title="Save this bus to My Buses"
                style={{ marginLeft: 'auto' }}
                onClick={() => onFavouriteBus(stop, svc.service_no)}>
                ⭐
              </button>
              <button className="plain" title="Notify me when arriving"
                style={{ opacity: watched(stop.id, svc.service_no) ? 1 : 0.4 }}
                onClick={() => toggleWatch(stop.id, svc.service_no)}>
                🔔
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
