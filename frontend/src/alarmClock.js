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

const pad = (n) => String(n).padStart(2, '0');

// Minutes-since-midnight → "HH:MM", wrapping past midnight.
export const toHHMM = (mins) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

// Day mask is 7 chars, index 0=Monday … 6=Sunday. JS getDay() is Sun=0, so shift.
export const mondayIndex = (d = new Date()) => (d.getDay() + 6) % 7;

export const activeToday = (days, d = new Date()) =>
  !days || days.length !== 7 ? true : days[mondayIndex(d)] === '1';
