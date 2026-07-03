// Dev: separate uvicorn on :8000. Web production (Vercel): same-origin /api.
// Native builds (Capacitor iOS/Android) have no same-origin backend, so they
// set VITE_API_BASE to the hosted API at build time.
const BASE =
  import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? 'http://localhost:8000' : '');

async function j(path, opts) {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}

const post = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const getHealth = () => j('/api/health');
export const getNearby = (lat, lon) =>
  j(`/api/stops/nearby?lat=${lat}&lon=${lon}&radius=800&limit=10`);
export const getArrivals = (stopId) => j(`/api/stops/${stopId}/arrivals`);
export const search = (q) => j(`/api/search?q=${encodeURIComponent(q)}`);
export const getRoute = (serviceNo) => j(`/api/services/${serviceNo}/route`);
export const getFavourites = () => j('/api/favourites');
export const addFavourite = (body) => j('/api/favourites', post(body));
export const renameFavourite = (id, name) =>
  j(`/api/favourites/${id}`, { ...post({ custom_name: name }), method: 'PATCH' });
export const deleteFavourite = (id) => j(`/api/favourites/${id}`, { method: 'DELETE' });
export const getSchedules = () => j('/api/schedules');
export const addSchedule = (body) => j('/api/schedules', post(body));
export const updateSchedule = (id, body) =>
  j(`/api/schedules/${id}`, { ...post(body), method: 'PATCH' });
export const deleteSchedule = (id) => j(`/api/schedules/${id}`, { method: 'DELETE' });
export const getVapidKey = () => j('/api/push/vapid');
export const subscribePush = (sub) => j('/api/push/subscribe', post(sub));
export const unsubscribePush = (sub) => j('/api/push/unsubscribe', post(sub));
