import { useState } from 'react';
import { deleteSchedule, getArrivals, updateSchedule } from '../api';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function AlarmRow({ s, live, onChanged }) {
  const [label, setLabel] = useState(s.label);
  const [avail, setAvail] = useState(null);   // service numbers at the stop
  const [editingBuses, setEditingBuses] = useState(false);

  const patch = (fields) => updateSchedule(s.id, fields).then(onChanged);
  const saveLabel = () => {
    const v = label.trim();
    if (v && v !== s.label) patch({ label: v }); else setLabel(s.label);
  };
  const mask = s.days && s.days.length === 7 ? s.days : '1111111';
  const toggleDay = (i) => { const a = mask.split(''); a[i] = a[i] === '1' ? '0' : '1'; patch({ days: a.join('') }); };

  const monitored = s.services || [];
  const openBusEditor = () => {
    setEditingBuses(true);
    if (!avail) getArrivals(s.stop_id).then((d) => setAvail(d.services.map((x) => x.service_no))).catch(() => setAvail([]));
  };
  const isOn = (no) => monitored.length === 0 || monitored.includes(no);
  const toggleBus = (no) => {
    if (!avail) return;
    const base = monitored.length ? new Set(monitored) : new Set(avail);
    if (base.has(no)) base.delete(no); else base.add(no);
    const arr = [...base];
    patch({ services: arr.length === avail.length ? [] : arr });
  };

  return (
    <div className={`card alarmcard ${s.enabled ? '' : 'paused'}`}>
      <div className="cardhead">
        <input className="alarmname" value={label}
          onChange={(e) => setLabel(e.target.value)} onBlur={saveLabel}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        <button className="plain" title={s.enabled ? 'Pause' : 'Resume'} onClick={() => patch({ enabled: !s.enabled })}>{s.enabled ? '⏰' : '💤'}</button>
        <button className="plain" title="Delete alarm" onClick={() => deleteSchedule(s.id).then(onChanged)}>🗑</button>
      </div>

      <div className="aflabel">Watching {monitored.length ? `${monitored.length} bus(es)` : 'all buses'}
        <button className="linkbtn" onClick={() => (editingBuses ? setEditingBuses(false) : openBusEditor())}>
          {editingBuses ? 'done' : 'edit buses'}
        </button>
      </div>
      {!editingBuses && (
        <div className="chips">
          {monitored.length === 0 && <span className="chip on static">All buses</span>}
          {monitored.map((no) => <span key={no} className="chip on static">{no}</span>)}
        </div>
      )}
      {editingBuses && (
        <div className="chips">
          {avail === null && <span className="muted small">Loading buses…</span>}
          {avail && avail.length === 0 && <span className="muted small">No live buses at this stop right now</span>}
          {avail && avail.map((no) => (
            <button key={no} className={`chip ${isOn(no) ? 'on' : ''}`} onClick={() => toggleBus(no)}>{no}</button>
          ))}
        </div>
      )}

      <div className="alarmtimes">
        <span className="muted">Daily</span>
        <input type="time" value={s.start_time} onChange={(e) => patch({ start_time: e.target.value })} />
        <span className="muted">to</span>
        <input type="time" value={s.end_time} onChange={(e) => patch({ end_time: e.target.value })} />
      </div>

      <div className="alarmdays">
        {DAY_LABELS.map((d, i) => (
          <button key={i} className={`day ${mask[i] === '1' ? 'on' : ''}`} onClick={() => toggleDay(i)}>{d}</button>
        ))}
      </div>

      <div className="alarmtimes">
        <span className="muted">Remind phone every</span>
        <select value={s.remind_every || 1} onChange={(e) => patch({ remind_every: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5, 10, 15].map((n) => <option key={n} value={n}>{n} min</option>)}
        </select>
      </div>

      {live && (
        <div className="alarmlive">
          {live.buses.length === 0
            ? <span className="muted">Active — no live timing right now</span>
            : live.buses.slice(0, 3).map((b) => (
                <span key={b.service_no} className="livebus">
                  <span className="fa-chip">{b.service_no}</span> {b.etas[0] <= 0 ? 'now' : `${b.etas[0]}m`}
                </span>
              ))}
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
        No bus alarms yet. On the <strong>Nearby</strong> tab, open a stop and tap ⏰ to watch a
        station — pick which buses and a daily time window (e.g. Caribbean, buses 143 & 61,
        06:40–07:00). During that window a floating widget shows the next 3 buses and your phone
        is reminded.
      </p>
    );
  }
  return (
    <>
      {schedules.map((s) => <AlarmRow key={s.id} s={s} live={liveById.get(s.id)} onChanged={onChanged} />)}
    </>
  );
}
