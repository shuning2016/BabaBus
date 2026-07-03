import { useState } from 'react';
import { deleteSchedule, updateSchedule } from '../api';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // Mon..Sun

/** One editable alarm: rename, adjust the daily window with native time
 *  pickers, pause/resume, delete — all committed straight to the server. */
function AlarmRow({ s, live, onChanged }) {
  const [label, setLabel] = useState(s.label);

  const patch = (fields) => updateSchedule(s.id, fields).then(onChanged);
  const saveLabel = () => {
    const v = label.trim();
    if (v && v !== s.label) patch({ label: v });
    else setLabel(s.label);
  };
  const mask = s.days && s.days.length === 7 ? s.days : '1111111';
  const toggleDay = (i) => {
    const arr = mask.split('');
    arr[i] = arr[i] === '1' ? '0' : '1';
    patch({ days: arr.join('') });
  };

  return (
    <div className={`card alarmcard ${s.enabled ? '' : 'paused'}`}>
      <div className="cardhead">
        <span className="svc-chip" style={{ cursor: 'default' }}>{s.service_no}</span>
        <input className="alarmname" value={label}
          onChange={(e) => setLabel(e.target.value)} onBlur={saveLabel}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        <button className="plain" title={s.enabled ? 'Pause alarm' : 'Resume alarm'}
          onClick={() => patch({ enabled: !s.enabled })}>{s.enabled ? '⏰' : '💤'}</button>
        <button className="plain" title="Delete alarm"
          onClick={() => deleteSchedule(s.id).then(onChanged)}>🗑</button>
      </div>
      <div className="alarmtimes">
        <span className="muted">Every day from</span>
        <input type="time" value={s.start_time} onChange={(e) => patch({ start_time: e.target.value })} />
        <span className="muted">to</span>
        <input type="time" value={s.end_time} onChange={(e) => patch({ end_time: e.target.value })} />
      </div>
      <div className="alarmdays">
        {DAY_LABELS.map((d, i) => (
          <button key={i} className={`day ${mask[i] === '1' ? 'on' : ''}`}
            title={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}
            onClick={() => toggleDay(i)}>{d}</button>
        ))}
      </div>
      <div className="alarmtimes">
        <span className="muted">Remind my phone every</span>
        <select value={s.remind_every || 4} onChange={(e) => patch({ remind_every: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 10, 15].map((n) => <option key={n} value={n}>{n} min</option>)}
        </select>
        <span className="muted">while active</span>
      </div>
      {live && (
        <div className="alarmlive">
          {live.etas.length
            ? <>🚌 Next now: <strong>{live.etas[0] <= 0 ? 'arriving' : `${live.etas[0]} min`}</strong>
                {live.etas.length > 1 && <span className="muted"> · then {live.etas.slice(1).map((e) => `${e}m`).join(', ')}</span>}</>
            : <span className="muted">Active window — no live timing right now</span>}
        </div>
      )}
    </div>
  );
}

export default function AlarmsPanel({ schedules, active, onChanged }) {
  const liveById = new Map(active.map((a) => [a.schedule.id, a]));

  if (!schedules.length) {
    return (
      <p className="empty">
        No bus alarms yet. On the <strong>Nearby</strong> tab, open a stop and tap ⏰ on a bus
        to watch it during a daily time window — e.g. bus 143 at Caribbean, 06:40–07:00.
        You'll get a reminder when it's arriving, and you can fine-tune the times right here.
      </p>
    );
  }

  return (
    <>
      {schedules.map((s) => (
        <AlarmRow key={s.id} s={s} live={liveById.get(s.id)} onChanged={onChanged} />
      ))}
    </>
  );
}
