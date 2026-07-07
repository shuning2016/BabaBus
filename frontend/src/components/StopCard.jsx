import { useEffect, useState } from 'react';
import { getArrivals } from '../api';
import ArrivalRow from './ArrivalRow';
import AlarmForm from './AlarmForm';

const POLL_MS = 15000;

export default function StopCard({
  stop, onShowBus, onShowRoute, onFavourite, onCreateStationAlarm,
  watchedBuses, onToggleWatchBus, onQuickAlarm,
  defaultOpen = false, autoAlarm = false, onAutoAlarmHandled,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [alarming, setAlarming] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Arriving from elsewhere (e.g. the map popup's "Set alarm") — open the form.
  useEffect(() => {
    if (autoAlarm) {
      setOpen(true);
      setAlarming(true);
      onAutoAlarmHandled?.();
    }
  }, [autoAlarm]);

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

  const openAlarm = () => { setOpen(true); setAlarming(true); };

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
        {onCreateStationAlarm && (
          <button className="plain" title="Set an alarm for this station" onClick={openAlarm}>⏰</button>
        )}
        <button className="plain" title="Add stop to Favourites" onClick={() => onFavourite(stop)}>⭐</button>
        <button className="plain caret" onClick={() => setOpen(!open)}>{open ? '▲' : '▼'}</button>
      </div>
      {open && error && <p className="stale">{error}</p>}
      {open && alarming && data && (
        <AlarmForm
          stop={{ id: stop.id, name: stop.name }}
          services={data.services.map((s) => s.service_no)}
          onCreate={(payload) => { onCreateStationAlarm(payload); setAlarming(false); }}
          onCancel={() => setAlarming(false)}
        />
      )}
      {open && data && (() => {
        const isWatching = (s) => watchedBuses?.has(`${stop.id}:${s.service_no}`);
        const watchingRows = data.services.filter(isWatching);
        // No watched buses here → show everything so the stop isn't empty
        const visible = showAll || watchingRows.length === 0 ? data.services : watchingRows;
        // Toggling while the full list is visible keeps it expanded, so picking
        // the first bus doesn't fold the card while the user adds more.
        const toggle = (no) => {
          if (showAll || watchingRows.length === 0) setShowAll(true);
          onToggleWatchBus(stop.id, data.stop_name, no);
        };
        return (
          <>
            {data.stale && <p className="stale">⚠ showing last known timings</p>}
            {visible.map((svc) => (
              <ArrivalRow key={svc.service_no} svc={svc} stopId={stop.id} stopName={data.stop_name}
                onShowBus={onShowBus} onShowRoute={onShowRoute}
                watching={isWatching(svc)}
                onToggleWatch={toggle}
                onQuickAlarm={onQuickAlarm} />
            ))}
            {watchingRows.length > 0 && watchingRows.length < data.services.length && (
              <button className="showall" onClick={() => setShowAll(!showAll)}>
                {showAll ? '▲ Only my watching buses' : `▼ Show all ${data.services.length} buses`}
              </button>
            )}
          </>
        );
      })()}
    </div>
  );
}
