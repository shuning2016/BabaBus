import { useState } from 'react';
import CapacityBar from './CapacityBar';

/**
 * One service's live arrivals row — shared by stop cards and favourite cards.
 * Chip click toggles the bus in/out of "my watching buses" (orange = watching).
 * The bell reflects this bus's alarm state and toggles it:
 *   🔔 plain          → no alarm; tap = quick alarm (now → +30 min)
 *   🔔 orange, pulsing → alarm running right now; tap = cancel it
 *   ⏰ outlined        → alarm set for a later window; tap = cancel it
 * (If the bus is covered by a multi-bus alarm, tapping opens the Alarms tab
 * instead of cancelling — cancelling would silence the other buses too.)
 * 🗺️ = route on map.
 */
export default function ArrivalRow({
  svc, stopId, stopName,
  onShowBus, onShowRoute, onToggleWatch, watching, onQuickAlarm,
  alarmFor, onCancelAlarm, onOpenAlarms,
}) {
  const [busy, setBusy] = useState(false);
  const alarm = alarmFor ? alarmFor(stopId, svc.service_no) : null;

  const bellClick = () => {
    if (busy) return;
    const settle = (p) => { setBusy(true); Promise.resolve(p).then(() => setBusy(false), () => setBusy(false)); };
    if (!alarm) return settle(onQuickAlarm(svc.service_no, stopId, stopName));
    if (alarm.schedule.services.length === 1 && onCancelAlarm) return settle(onCancelAlarm(alarm.schedule));
    return onOpenAlarms && onOpenAlarms();
  };

  const bellTitle = !alarm
    ? 'Alarm this bus here for the next 30 min'
    : alarm.schedule.services.length !== 1
      ? 'Covered by a multi-bus alarm — tap to manage in Alarms'
      : alarm.running
        ? `Alarm running until ${alarm.schedule.end_time} — tap to cancel`
        : `Alarm set for ${alarm.schedule.start_time}–${alarm.schedule.end_time} — tap to cancel`;

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
          <button
            className={`plain bell ${alarm ? (alarm.running ? 'bell-live' : 'bell-set') : ''}`}
            title={bellTitle} onClick={bellClick}>
            {busy ? '⏳' : alarm ? (alarm.running ? '🔔' : '⏰') : '🔔'}
          </button>
        )}
      </div>
    </div>
  );
}
