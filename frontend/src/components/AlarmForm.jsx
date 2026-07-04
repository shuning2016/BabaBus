import { useState } from 'react';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (mins) => `${pad(Math.floor((mins % 1440) / 60))}:${pad(mins % 60)}`;
const nowMins = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

/**
 * Create a station alarm: pick which buses to monitor, the daily time window
 * and which days. Empty selection = watch every bus at the stop.
 */
export default function AlarmForm({ stop, services, onCreate, onCancel }) {
  const [picked, setPicked] = useState(() => new Set(services)); // default: all
  const [start, setStart] = useState(hhmm(nowMins()));
  const [end, setEnd] = useState(hhmm(nowMins() + 30));
  const [days, setDays] = useState('1111111');

  const toggle = (no) => {
    const next = new Set(picked);
    if (next.has(no)) next.delete(no); else next.add(no);
    setPicked(next);
  };
  const toggleDay = (i) => {
    const arr = days.split(''); arr[i] = arr[i] === '1' ? '0' : '1'; setDays(arr.join(''));
  };

  const submit = () => {
    // all selected (or none) → send [] meaning "all buses at this stop"
    const all = picked.size === services.length;
    onCreate({
      stop_id: stop.id,
      services: all ? [] : [...picked],
      start_time: start,
      end_time: end,
      days,
      label: `${stop.name}`,
    });
  };

  return (
    <div className="alarmform">
      <div className="afhead">Set an alarm for <strong>{stop.name}</strong></div>

      <div className="aflabel">Watch which buses?</div>
      <div className="chips">
        {services.map((no) => (
          <button key={no} className={`chip ${picked.has(no) ? 'on' : ''}`} onClick={() => toggle(no)}>
            {no}
          </button>
        ))}
      </div>
      <div className="muted small">
        {picked.size === 0 || picked.size === services.length ? 'Watching all buses at this stop' : `Watching ${picked.size} bus(es)`}
      </div>

      <div className="aflabel">Time window (daily)</div>
      <div className="afrow">
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <span className="muted">to</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>

      <div className="aflabel">On which days</div>
      <div className="alarmdays">
        {DAY_LABELS.map((d, i) => (
          <button key={i} className={`day ${days[i] === '1' ? 'on' : ''}`} onClick={() => toggleDay(i)}>{d}</button>
        ))}
      </div>

      <div className="afactions">
        <button className="pill ghost" onClick={onCancel}>Cancel</button>
        <button className="pill" onClick={submit}>Create alarm</button>
      </div>
    </div>
  );
}
