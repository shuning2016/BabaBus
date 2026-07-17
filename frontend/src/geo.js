// Approximate metres between two [lat, lon] points (accurate enough at city scale).
export const approxMetres = (a, b) => {
  const dLat = (a[0] - b[0]) * 111320;
  const dLon = (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
};

let _busSeq = 0;

// A bus travels at most ~375 m between 15 s polls (90 km/h); matches beyond
// this are different buses — relinking them made markers slide across town.
const MATCH_MAX_M = 400;

/**
 * Give each incoming bus a stable id by matching it to a previous bus of the
 * same service, so the map animates markers instead of remounting them.
 * Matching is globally-nearest-first (all candidate pairs sorted by distance),
 * not first-come greedy: greedy let two nearby buses of one service swap
 * identities between polls, which showed as markers gliding through each other.
 */
export const assignBusIds = (prev, raw) => {
  const pairs = [];
  raw.forEach((b, bi) => {
    prev.forEach((p) => {
      if (p.service_no !== b.service_no) return;
      const d = approxMetres([b.lat, b.lon], [p.lat, p.lon]);
      if (d <= MATCH_MAX_M) pairs.push([d, bi, p.id]);
    });
  });
  pairs.sort((a, b) => a[0] - b[0]);
  const idByIndex = new Map();
  const used = new Set();
  for (const [, bi, id] of pairs) {
    if (idByIndex.has(bi) || used.has(id)) continue;
    idByIndex.set(bi, id);
    used.add(id);
  }
  return raw.map((b, bi) => {
    if (idByIndex.has(bi)) return { ...b, id: idByIndex.get(bi) };
    _busSeq += 1;
    return { ...b, id: `bus-${_busSeq}` };
  });
};
