// Anonymous per-device identity. A stable random id is generated once and kept
// in localStorage; it's sent as X-Device-Id on every API call so this device's
// favourites, alarms and push subscriptions stay its own (no login needed).
const KEY = 'bababus-device-id';

const makeId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

export function deviceId() {
  let id = null;
  try {
    id = localStorage.getItem(KEY);
    if (!id) {
      id = makeId();
      localStorage.setItem(KEY, id);
    }
  } catch {
    // localStorage blocked (rare) — fall back to a per-session id.
    id = id || makeId();
  }
  return id;
}

// Ask the browser to keep our storage (favourites/alarms) from being evicted.
// Installed PWAs are usually granted this; harmless where unsupported.
export function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}
