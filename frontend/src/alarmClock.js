// Pure helpers for alarm time windows — dependency-free so plain node can test them.

export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// True when nowMin falls inside [start, end); windows crossing midnight
// (e.g. 23:30–00:15) are supported.
export const isWithinWindow = (nowMin, start, end) => {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s <= e ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e;
};

export const minutesNow = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
