import { deleteSchedule, updateSchedule } from '../api';

/** Sidebar list of timed bus watches with live "next bus" while active. */
export default function AlarmsPanel({ schedules, active, onChanged }) {
  const liveById = new Map(active.map((a) => [a.schedule.id, a]));

  if (!schedules.length) {
    return (
      <p style={{ fontSize: 12, color: '#c7d0e0' }}>
        No alarms yet — open a stop and tap ⏰ on a bus to watch it at set times.
      </p>
    );
  }

  return (
    <div>
      {schedules.map((s) => {
        const live = liveById.get(s.id);
        return (
          <div key={s.id} className="alarm" style={{ opacity: s.enabled ? 1 : 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="favchip">{s.service_no}</span>
              <span className="alarmlabel">{s.label || s.stop_id}</span>
              <button className="plain" title={s.enabled ? 'Pause alarm' : 'Resume alarm'}
                onClick={() => updateSchedule(s.id, { enabled: !s.enabled }).then(onChanged)}>
                {s.enabled ? '⏰' : '💤'}
              </button>
              <button className="plain" title="Delete alarm"
                onClick={() => deleteSchedule(s.id).then(onChanged)}>
                🗑
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#c7d0e0' }}>
              {s.start_time}–{s.end_time} daily
              {live && (live.etas.length
                ? <strong style={{ color: 'var(--shopee-yellow)' }}>
                    {' '}· next {live.etas[0] <= 0 ? 'now' : `${live.etas[0]} min`}
                  </strong>
                : ' · no live timing')}
            </div>
          </div>
        );
      })}
    </div>
  );
}
