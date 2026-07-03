import { useEffect, useRef, useState } from 'react';
import { getArrivals } from './api';

const THRESHOLD_MIN = 3;
const POLL_MS = 15000;

const canNotify = () => typeof Notification !== 'undefined';

export default function useWatch() {
  const [, setVersion] = useState(0);
  const keys = useRef(new Set());
  const timers = useRef({});

  const bump = () => setVersion((v) => v + 1);

  const watched = (stopId, serviceNo) => keys.current.has(`${stopId}:${serviceNo}`);

  const stop = (key) => {
    clearInterval(timers.current[key]);
    delete timers.current[key];
    keys.current.delete(key);
    bump();
  };

  const toggleWatch = (stopId, serviceNo) => {
    const key = `${stopId}:${serviceNo}`;
    if (keys.current.has(key)) return stop(key);
    if (canNotify() && Notification.permission === 'default') Notification.requestPermission();
    const check = async () => {
      try {
        const data = await getArrivals(stopId);
        const svc = data.services.find((s) => s.service_no === serviceNo);
        if (svc && svc.etas.length && svc.etas[0] <= THRESHOLD_MIN) {
          if (canNotify() && Notification.permission === 'granted') {
            new Notification(`🚌 Bus ${serviceNo} arriving`, {
              body: `${svc.etas[0] <= 0 ? 'Arriving now' : `${svc.etas[0]} min`} at ${data.stop_name}`,
            });
          }
          stop(key);
        }
      } catch { /* keep watching through transient errors */ }
    };
    timers.current[key] = setInterval(check, POLL_MS);
    keys.current.add(key);
    bump();
    check();
  };

  useEffect(() => () => Object.values(timers.current).forEach(clearInterval), []);

  return { watched, toggleWatch };
}
