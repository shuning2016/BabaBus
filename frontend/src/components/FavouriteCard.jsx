import { useEffect, useState } from 'react';
import { getArrivals } from '../api';
import ArrivalRow from './ArrivalRow';
import AlarmForm from './AlarmForm';

const POLL_MS = 15000;

/**
 * A saved favourite that shows its live arrivals inline.
 *  - bus favourite (service_no set) → that service's next 3 timings
 *  - stop favourite → every service at the stop, like the stop view
 * The ⏰ opens the station alarm form (bus favourites preselect their bus).
 */
export default function FavouriteCard({
  fav, onShowBus, onShowRoute, onCreateStationAlarm, onQuickAlarm, onRename, onDelete,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [alarming, setAlarming] = useState(false);
  const isBus = !!fav.service_no;

  useEffect(() => {
    let alive = true;
    const load = () =>
      getArrivals(fav.stop_id)
        .then((d) => alive && (setData(d), setError(false)))
        .catch(() => alive && setError(true));
    load();
    const timer = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [fav.stop_id]);

  const services = data
    ? (isBus ? data.services.filter((s) => s.service_no === fav.service_no) : data.services)
    : [];

  return (
    <div className="card">
      <div className="cardhead">
        <div style={{ flex: 1 }}>
          <h3>{isBus ? '🚌 ' : '🚏 '}{fav.custom_name}</h3>
          <span className="muted">{data ? data.stop_name : fav.stop_id}</span>
        </div>
        {onCreateStationAlarm && data && !isBus && (
          <button className="plain" title="Set an alarm for this station"
            onClick={() => setAlarming(!alarming)}>⏰</button>
        )}
        <button className="plain" title="Rename" onClick={() => onRename(fav.id)}>✏️</button>
        <button className="plain" title="Remove" onClick={() => onDelete(fav.id)}>🗑</button>
      </div>
      {error && <p className="stale">Couldn't load timings</p>}
      {!data && !error && <p className="muted">Loading timings…</p>}
      {data && alarming && !isBus && (
        <AlarmForm
          stop={{ id: fav.stop_id, name: data.stop_name }}
          services={data.services.map((s) => s.service_no)}
          onCreate={(payload) => { onCreateStationAlarm(payload); setAlarming(false); }}
          onCancel={() => setAlarming(false)}
        />
      )}
      {data && data.stale && <p className="stale">⚠ showing last known timings</p>}
      {data && services.length === 0 && (
        <p className="muted">{isBus ? `No ${fav.service_no} running now` : 'No services here now'}</p>
      )}
      {services.map((svc) => (
        <ArrivalRow key={svc.service_no} svc={svc} stopId={fav.stop_id} stopName={data.stop_name}
          onShowBus={onShowBus} onShowRoute={onShowRoute} onQuickAlarm={onQuickAlarm}
          showSave={false} />
      ))}
    </div>
  );
}
