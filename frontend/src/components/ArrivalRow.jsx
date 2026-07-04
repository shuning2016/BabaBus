import { useState } from 'react';
import CapacityBar from './CapacityBar';

/**
 * One service's live arrivals row — shared by stop cards and favourite cards.
 * Chip click toggles the bus in/out of "my watching buses" (orange = watching).
 * 🔔 = quick alarm (this bus, this stop, now → +30 min). 🗺️ = route on map.
 */
export default function ArrivalRow({
  svc, stopId, stopName,
  onShowBus, onShowRoute, onToggleWatch, watching, onQuickAlarm,
}) {
  const [ringing, setRinging] = useState(false);

  const ring = () => {
    Promise.resolve(onQuickAlarm(svc.service_no, stopId, stopName)).then(() => {
      setRinging(true);
      setTimeout(() => setRinging(false), 1500);
    });
  };

  return (
    <div className="row">
      <button
        className={`svc-chip ${watching ? '' : 'off'}`}
        title={watching ? 'Watching — click to remove from my buses' : 'Click to add to my watching buses'}
        onClick={() => onToggleWatch && onToggleWatch(svc.service_no)}>
        {svc.service_no}
      </button>
      <div className="etas">
        {svc.etas.length === 0 && <span className="eta-none">no timing</span>}
        {svc.etas.map((eta, i) => (
          <span key={i}
            className={`eta ${i === 0 ? 'eta-lead' : ''} ${eta <= 1 ? 'now' : ''}`}
            title="Show this bus on the map"
            onClick={() => onShowBus(stopId, svc.service_no, svc.bus_positions, stopName)}>
            {eta <= 0 ? 'Arr' : `${eta}${i === 0 ? ' min' : ''}`}
          </span>
        ))}
      </div>
      <CapacityBar load={svc.load} />
      <div className="rowactions">
        <button className="plain" title="View route on map"
          onClick={() => onShowRoute(svc.service_no)}>🗺️</button>
        {onQuickAlarm && (
          <button className="plain" title="Alarm this bus here for the next 30 min"
            onClick={ring}>{ringing ? '✅' : '🔔'}</button>
        )}
      </div>
    </div>
  );
}
