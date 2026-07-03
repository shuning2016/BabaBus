import { useEffect, useRef, useState } from 'react';
import { getArrivals } from './api';

const THRESHOLD_MIN = 3;
const POLL_MS = 15000;

export default function useWatch() {
  const [keys, setKeys] = useState(new Set());
  const timers = useRef({});

  const watched = (stopId, serviceNo) => keys.has(`${stopId}:${serviceNo}`);

  const stop = (key) => {
    clearInterval(timers.current[key]);
    delete timers.current[key];
    setKeys((k) => { const n = new Set(k); n.delete(key); return n; });
  };

  const toggleWatch = (stopId, serviceNo) => {
    const key = `${stopId}:${serviceNo}`;
    if (keys.has(key)) return stop(key);
    if (Notification.permission === 'default') Notification.requestPermission();
    const check = async () => {
      try {
        const data = await getArrivals(stopId);
        const svc = data.services.find((s) => s.service_no === serviceNo);
        if (svc && svc.etas.length && svc.etas[0] <= THRESHOLD_MIN) {
          if (Notification.permission === 'granted') {
            new Notification(`🚌 Bus ${serviceNo} arriving`, {
              body: `${svc.etas[0] <= 0 ? 'Arriving now' : `${svc.etas[0]} min`} at ${data.stop_name}`,
            });
          }
          stop(key);
        }
      } catch { /* keep watching through transient errors */ }
    };
    timers.current[key] = setInterval(check, POLL_MS);
    check();
    setKeys((k) => new Set(k).add(key));
    return undefined;
  };

  useEffect(() => () => Object.values(timers.current).forEach(clearInterval), []);

  return { watched, toggleWatch };
}
