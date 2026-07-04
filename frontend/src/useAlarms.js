import { useEffect, useRef, useState } from 'react';
import { getArrivals } from './api';
import { activeToday, isWithinWindow, minutesNow } from './alarmClock';

const TICK_MS = 20000;
const ARRIVING_MIN = 2;

const canNotify = () => typeof Notification !== 'undefined';
const notify = (title, body) => {
  if (canNotify() && Notification.permission === 'granted') new Notification(title, { body });
};

/**
 * Watches enabled alarms during their windows. For each active alarm it polls
 * the station's arrivals and keeps the monitored buses' next timings, returning
 * [{schedule, stopName, buses:[{service_no, etas, load}]}] for the floating
 * widget, and firing a foreground notification when a monitored bus is near.
 */
export default function useAlarms(schedules) {
  const [active, setActive] = useState([]);
  const announced = useRef(new Set()); // "id:date" → window-open notice sent
  const arriving = useRef(new Set()); // "id:service" already notified this bus

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const nowMin = minutesNow();
      const due = schedules.filter(
        (s) => s.enabled && activeToday(s.days) && isWithinWindow(nowMin, s.start_time, s.end_time)
      );
      if (!due.length) { if (alive) setActive([]); return; }

      const results = await Promise.all(due.map(async (s) => {
        try {
          const d = await getArrivals(s.stop_id);
          const watch = s.services && s.services.length ? s.services : null; // null = all
          const buses = d.services
            .filter((x) => !watch || watch.includes(x.service_no))
            .map((x) => ({ service_no: x.service_no, etas: x.etas, load: x.load }))
            .filter((x) => x.etas.length)
            .sort((a, b) => a.etas[0] - b.etas[0]);
          return { schedule: s, stopName: d.stop_name, buses };
        } catch {
          return { schedule: s, stopName: s.label || s.stop_id, buses: [], error: true };
        }
      }));
      if (!alive) return;
      setActive(results);

      const today = new Date().toDateString();
      results.forEach(({ schedule: s, stopName, buses }) => {
        const openKey = `${s.id}:${today}`;
        if (!announced.current.has(openKey)) {
          announced.current.add(openKey);
          notify(`⏰ ${s.label || stopName}`, buses.length
            ? buses.slice(0, 3).map((b) => `${b.service_no} ${b.etas[0] <= 0 ? 'now' : `${b.etas[0]}m`}`).join(' · ')
            : `Watching ${stopName}`);
        }
        buses.forEach((b) => {
          const key = `${s.id}:${b.service_no}`;
          if (b.etas[0] <= ARRIVING_MIN) {
            if (!arriving.current.has(key)) {
              arriving.current.add(key);
              notify(`🚌 Bus ${b.service_no} arriving`, `${b.etas[0] <= 0 ? 'Now' : `${b.etas[0]} min`} at ${stopName}`);
            }
          } else if (b.etas[0] > ARRIVING_MIN + 2) {
            arriving.current.delete(key); // bus passed — re-arm for the next one
          }
        });
      });
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [schedules]);

  return active;
}
