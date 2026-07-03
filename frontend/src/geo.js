// Approximate metres between two [lat, lon] points (accurate enough at city scale).
export const approxMetres = (a, b) => {
  const dLat = (a[0] - b[0]) * 111320;
  const dLon = (a[1] - b[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
};

let _busSeq = 0;

/**
 * Give each incoming bus a stable id by matching it to the nearest previous
 * bus of the same service, so the map can animate a marker from its old
 * position to its new one instead of remounting (which looks like teleporting).
 */
export const assignBusIds = (prev, raw) => {
  const used = new Set();
  return raw.map((b) => {
    let best = null;
    let bestD = Infinity;
    for (const p of prev) {
      if (used.has(p.id) || p.service_no !== b.service_no) continue;
      const d = approxMetres([b.lat, b.lon], [p.lat, p.lon]);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best && bestD < 1500) {
      used.add(best.id);
      return { ...b, id: best.id };
    }
    _busSeq += 1;
    return { ...b, id: `bus-${_busSeq}` };
  });
};
