import { useEffect, useRef, useState } from 'react';
import { getArrivals } from './api';
import { isWithinWindow, minutesNow } from './alarmClock';

const TICK_MS = 20000;
const ARRIVING_MIN = 2;

const canNotify = () => typeof Notification !== 'undefined';
const notify = (title, body) => {
  if (canNotify() && Notification.permission === 'granted') new Notification(title, { body });
};

/**
 * Watches enabled schedules during their time windows: polls arrivals for
 * each active one and returns live rows for the banner, firing a system
 * notification when a window opens and when a monitored bus is arriving.
 */
export default function useAlarms(schedules) {
  const [active, setActive] = useState([]); // [{schedule, stopName, etas, load}]
  const announced = useRef(new Set()); // "id:date:start" → window-open notice sent
  const arriving = useRef(new Set()); // schedule ids already notified for the current bus

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const nowMin = minutesNow();
      const due = schedules.filter(
        (s) => s.enabled && isWithinWindow(nowMin, s.start_time, s.end_time)
      );
      if (!due.length) {
        if (alive) setActive([]);
        return;
      }
      const results = await Promise.all(
        due.map(async (s) => {
          try {
            const d = await getArrivals(s.stop_id);
            const svc = d.services.find((x) => x.service_no === s.service_no);
            return { schedule: s, stopName: d.stop_name, etas: svc ? svc.etas : [], load: svc?.load };
          } catch {
            return { schedule: s, stopName: s.stop_id, etas: [], error: true };
          }
        })
      );
      if (!alive) return;
      setActive(results);

      const today = new Date().toDateString();
      results.forEach(({ schedule: s, stopName, etas }) => {
        const onceKey = `${s.id}:${today}:${s.start_time}`;
        if (!announced.current.has(onceKey)) {
          announced.current.add(onceKey);
          notify(`⏰ Watching bus ${s.service_no}`, etas.length
            ? `Next at ${stopName}: ${etas[0] <= 0 ? 'now' : `${etas[0]} min`}`
            : `No live timing at ${stopName} yet`);
        }
        if (etas.length && etas[0] <= ARRIVING_MIN) {
          if (!arriving.current.has(s.id)) {
            arriving.current.add(s.id);
            notify(`🚌 Bus ${s.service_no} arriving`,
              `${etas[0] <= 0 ? 'Now' : `${etas[0]} min`} at ${stopName}`);
          }
        } else if (etas.length && etas[0] > ARRIVING_MIN + 2) {
          arriving.current.delete(s.id); // that bus passed — re-arm for the next one
        }
      });
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [schedules]);

  return active;
}
