import { useEffect, useState } from 'react';
import { getArrivals } from '../api';
import ArrivalRow from './ArrivalRow';
import AlarmForm from './AlarmForm';

const POLL_MS = 15000;

/**
 * One favourite STOP with live arrivals inline — watching buses first, chip
 * toggles membership, "show all" expands. Cards without a saved stop
 * favourite (implicit: created by watching buses there) have no rename/delete;
 * un-watch the buses to make them disappear.
 */
export default function FavouriteCard({
  fav, onShowBus, onShowRoute, onCreateStationAlarm,
  watchedBuses, onToggleWatchBus, onQuickAlarm, onRename, onDelete, onRemoveStop,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [alarming, setAlarming] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const implicit = !fav.id;

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

  const isWatching = (s) => watchedBuses?.has(`${fav.stop_id}:${s.service_no}`);
  const all = data ? data.services : [];
  const watching = all.filter(isWatching);
  const services = showAll || watching.length === 0 ? all : watching;
  const hiddenCount = watching.length > 0 ? all.length - watching.length : 0;
  const title = fav.custom_name || (data ? data.stop_name : fav.stop_id);
  // Toggling while the full list is visible keeps it expanded, so picking the
  // first bus doesn't fold the card while the user adds more.
  const toggleWatch = (no) => {
    if (showAll || watching.length === 0) setShowAll(true);
    onToggleWatchBus(fav.stop_id, data.stop_name, no);
  };

  return (
    <div className="card">
      <div className="cardhead">
        <div style={{ flex: 1 }}>
          <h3>🚏 {title}</h3>
          <span className="muted">{data ? data.stop_name : fav.stop_id}</span>
        </div>
        {onCreateStationAlarm && data && (
          <button className="plain" title="Set an alarm for this station"
            onClick={() => setAlarming(!alarming)}>⏰</button>
        )}
        {!implicit && <button className="plain" title="Rename" onClick={() => onRename(fav.id)}>✏️</button>}
        {!implicit && <button className="plain" title="Remove" onClick={() => onDelete(fav.id)}>🗑</button>}
        {implicit && onRemoveStop && (
          <button className="plain" title="Remove — stop watching all buses here"
            onClick={() => onRemoveStop(fav.stop_id)}>🗑</button>
        )}
      </div>
      {error && <p className="stale">Couldn't load timings</p>}
      {!data && !error && <p className="muted">Loading timings…</p>}
      {data && alarming && (
        <AlarmForm
          stop={{ id: fav.stop_id, name: data.stop_name }}
          services={all.map((s) => s.service_no)}
          initialPicked={watching.length ? watching.map((s) => s.service_no) : undefined}
          onCreate={(payload) => { onCreateStationAlarm(payload); setAlarming(false); }}
          onCancel={() => setAlarming(false)}
        />
      )}
      {data && data.stale && <p className="stale">⚠ showing last known timings</p>}
      {data && all.length === 0 && <p className="muted">No services here now</p>}
      {services.map((svc) => (
        <ArrivalRow key={svc.service_no} svc={svc} stopId={fav.stop_id} stopName={data.stop_name}
          onShowBus={onShowBus} onShowRoute={onShowRoute} onQuickAlarm={onQuickAlarm}
          watching={isWatching(svc)}
          onToggleWatch={toggleWatch} />
      ))}
      {hiddenCount > 0 && (
        <button className="showall" onClick={() => setShowAll(!showAll)}>
          {showAll ? '▲ Only my watching buses' : `▼ Show all ${all.length} buses`}
        </button>
      )}
    </div>
  );
}
