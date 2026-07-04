import { useState } from 'react';

/**
 * Floating widget pinned to the top of the screen while any alarm window is
 * active. Shows each watched station with its next 3 monitored buses. Can be
 * minimized to a pill or dismissed for this session.
 */
export default function FloatingAlarms({ active, onOpenAlarms }) {
  const [minimized, setMinimized] = useState(false);
  const [dismissedKey, setDismissedKey] = useState(null);

  // Key of the current active set — re-showing when the set changes after dismiss
  const key = active.map((a) => a.schedule.id).sort().join(',');
  if (!active.length || dismissedKey === key) return null;

  const eta = (e) => (e <= 0 ? 'now' : `${e}m`);

  if (minimized) {
    const first = active[0]?.buses[0];
    return (
      <button className="fa-pill" onClick={() => setMinimized(false)}>
        ⏰ {active.length} alarm{active.length > 1 ? 's' : ''}
        {first && <span> · {first.service_no} {eta(first.etas[0])}</span>}
      </button>
    );
  }

  return (
    <div className="fa-widget">
      <div className="fa-head">
        <span>⏰ Bus alarms</span>
        <div className="fa-btns">
          <button title="Minimize" onClick={() => setMinimized(true)}>—</button>
          <button title="Dismiss" onClick={() => setDismissedKey(key)}>✕</button>
        </div>
      </div>
      {active.map(({ schedule, stopName, buses }) => (
        <div className="fa-stop" key={schedule.id} onClick={onOpenAlarms}>
          <div className="fa-name">{schedule.label || stopName}</div>
          {buses.length === 0 && <div className="fa-none">No live timing right now</div>}
          {buses.slice(0, 3).map((b) => (
            <div className="fa-bus" key={b.service_no}>
              <span className="fa-chip">{b.service_no}</span>
              <span className="fa-etas">
                {b.etas.slice(0, 3).map((e, i) => (
                  <span key={i} className={i === 0 ? 'lead' : ''}>{eta(e)}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
