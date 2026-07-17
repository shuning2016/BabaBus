import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { useEffect, useRef, useState } from 'react';
import { getArrivals } from '../api';
import { approxMetres } from '../geo';

const ORANGE = '#EE4D2D';

/* Dead-reckoned bus motion ("the Uber way"). The displayed bus always CHASES a
   target with easing — new data moves the target, never the bus, so there are
   no jumps. The target = last real fix advanced toward the bus's destination
   stop at a deliberately conservative speed: undershooting means corrections
   are gentle forward speed-ups; overshooting would force backward slides. */
const SPEED_FACTOR = 0.6;  // predict at 60% of the ETA-implied speed
const PREDICT_CAP_S = 25;  // no fresh data for this long → pause (bus may be dwelling)
const CHASE_PER_S = 0.6;   // easing: close ~this fraction of the gap per second
const MAX_MPS = 16;        // never predict faster than ~58 km/h
const MAX_VISUAL_MPS = 25; // hard on-screen speed limit (~90 km/h): corrections
                           // move at bus speed, never as a supersonic slide
const GRACE_MS = 40000;    // keep a bus that vanished from one poll this long —
                           // blips (failed fetch, feed flicker) shouldn't delete it
const BACK_TOLERANCE_M = 80; // hold small backward corrections (dwell overshoot);
                             // beyond this, reality wins and the marker drives back
const M_PER_DEG = 111320;

/** Velocity (degrees/second) from a fix toward the destination stop at the
 *  ETA-implied speed, scaled down by SPEED_FACTOR. */
function velocityToward(fix, dest, etaS) {
  if (!dest || !etaS) return { vlat: 0, vlon: 0 };
  const cos = Math.cos((fix.lat * Math.PI) / 180);
  const dLatM = (dest.lat - fix.lat) * M_PER_DEG;
  const dLonM = (dest.lon - fix.lon) * M_PER_DEG * cos;
  const dist = Math.hypot(dLatM, dLonM);
  if (dist < 20) return { vlat: 0, vlon: 0 }; // basically at the stop — hold
  const mps = Math.min(MAX_MPS, (dist / etaS) * SPEED_FACTOR);
  return {
    vlat: ((dLatM / dist) * mps) / M_PER_DEG,
    vlon: ((dLonM / dist) * mps) / (M_PER_DEG * cos),
  };
}

const busIcon = L.divIcon({
  className: '',
  html: `<div style="background:${ORANGE};color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid #fff">🚌</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

const busChipIcon = (serviceNo) =>
  L.divIcon({
    className: '',
    html: `<div style="background:${ORANGE};color:#fff;border-radius:12px;padding:2px 8px 2px 6px;font-size:12px;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:3px;box-shadow:0 2px 6px rgba(0,0,0,.35);border:1.5px solid #fff">🚌 ${serviceNo}</div>`,
    iconSize: [46, 22],
    iconAnchor: [23, 11],
  });

// Google-style teardrop pin for a picked location
const placeIcon = L.divIcon({
  className: '',
  html: `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 10 15 25 15 25s15-15 15-25C30 6.7 23.3 0 15 0z" fill="${ORANGE}" stroke="#fff" stroke-width="2"/>
    <circle cx="15" cy="15" r="5.5" fill="#fff"/>
  </svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});

function FitBounds({ points }) {
  const map = useMap();
  const signature = JSON.stringify(points);
  useEffect(() => {
    const pts = JSON.parse(signature);
    if (pts.length === 1) map.setView(pts[0], 16);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
  }, [map, signature]);
  return null;
}

function ClickCatcher({ onPickPoint }) {
  useMapEvents({ click: (e) => onPickPoint(e.latlng.lat, e.latlng.lng) });
  return null;
}

function MoveCatcher({ onMapMove }) {
  useMapEvents({ moveend: (e) => { const c = e.target.getCenter(); onMapMove(c.lat, c.lng); } });
  return null;
}

/** Recompute the map size when its pane becomes visible (tabbed layout). */
function InvalidateOnActive({ active }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(t);
  }, [active, map]);
  return null;
}

/** Popup DOM for a moving bus: label + 🔔 quick-alarm button (raw Leaflet
 *  markers can't host JSX, so the popup is built by hand). */
function busPopupContent(bus, onQuickAlarmBus) {
  const div = document.createElement('div');
  const label = document.createElement('div');
  label.style.cssText = 'font-size:12px;color:#172B4D';
  label.innerHTML = `<strong>Bus ${bus.service_no}</strong> — heading to ${bus.toward}`;
  div.appendChild(label);
  if (onQuickAlarmBus) {
    const btn = document.createElement('button');
    btn.textContent = '🔔 Alarm this bus (next 30 min)';
    btn.style.cssText = `margin-top:8px;width:100%;background:${ORANGE};color:#fff;border:none;border-radius:8px;padding:6px 10px;font-family:inherit;font-weight:700;font-size:12px;cursor:pointer`;
    btn.onclick = () => {
      btn.textContent = '✅ Alarm set — watching its next stop';
      btn.disabled = true;
      onQuickAlarmBus(bus);
    };
    div.appendChild(btn);
  }
  return div;
}

/** Live buses as Leaflet markers in continuous dead-reckoned motion: each
 *  frame the displayed position eases toward (last fix + predicted advance),
 *  so buses move from their very first sample and data refreshes bend their
 *  velocity instead of jumping them. */
function AnimatedBuses({ buses, onQuickAlarmBus }) {
  const map = useMap();
  const store = useRef(new Map()); // id -> { marker, fix:{lat,lon,at}, vel, pos }
  const lastFrame = useRef(0);

  useEffect(() => {
    let raf;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min((now - (lastFrame.current || now)) / 1000, 0.1);
      lastFrame.current = now;
      const k = Math.min(1, CHASE_PER_S * dt);
      store.current.forEach((m) => {
        const age = Math.min((now - m.fix.at) / 1000, PREDICT_CAP_S);
        const tgtLat = m.fix.lat + m.vel.vlat * age;
        const tgtLon = m.fix.lon + m.vel.vlon * age;
        let stepLat = (tgtLat - m.pos.lat) * k;
        let stepLon = (tgtLon - m.pos.lon) * k;
        const cosLat = Math.cos((m.pos.lat * Math.PI) / 180);
        const gapM = Math.hypot((tgtLat - m.pos.lat) * M_PER_DEG, (tgtLon - m.pos.lon) * M_PER_DEG * cosLat);
        // Hard speed limit: however large the correction, the marker moves at
        // plausible bus speed — big gaps become a drive, not a teleport-slide.
        const stepM = Math.hypot(stepLat * M_PER_DEG, stepLon * M_PER_DEG * cosLat);
        const maxM = MAX_VISUAL_MPS * dt;
        if (stepM > maxM) {
          const s = maxM / stepM;
          stepLat *= s;
          stepLon *= s;
        }
        // Small backward corrections are dwell overshoot — hold and let reality
        // catch up. But past BACK_TOLERANCE_M reality wins even backward:
        // vetoing forever left the marker stuck until the 500 m snap, which
        // showed as buses teleporting/"suddenly appearing" on a refresh.
        const backward = stepLat * m.vel.vlat + stepLon * m.vel.vlon < 0;
        if (!backward || gapM > BACK_TOLERANCE_M) {
          m.pos.lat += stepLat;
          m.pos.lon += stepLon;
          m.marker.setLatLng([m.pos.lat, m.pos.lon]);
        }
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const now = performance.now();
    const seen = new Set();
    buses.forEach((b) => {
      seen.add(b.id);
      const fix = { lat: b.lat, lon: b.lon, at: now };
      const vel = velocityToward(fix, b.dest, b.eta_s);
      const existing = store.current.get(b.id);
      if (existing) {
        existing.lastSeen = now;
        // Only accept the sample as a NEW fix if the bus actually moved.
        // Refreshes often re-serve the same position (cache / LTA cadence);
        // resetting the prediction to it would yank the marker backward and
        // make buses seesaw on every poll.
        if (approxMetres([b.lat, b.lon], [existing.fix.lat, existing.fix.lon]) > 8) {
          existing.fix = fix;
          existing.vel = vel;
        }
        // A big gap means stale data from a long background — snap, don't chase.
        if (approxMetres([b.lat, b.lon], [existing.pos.lat, existing.pos.lon]) > 500) {
          existing.pos = { lat: b.lat, lon: b.lon };
          existing.marker.setLatLng([b.lat, b.lon]);
        }
        if (!existing.marker.isPopupOpen()) {
          existing.marker.setPopupContent(busPopupContent(b, onQuickAlarmBus));
        }
      } else {
        // Fade new buses in: entering the feed's window is normal (LTA only
        // exposes the next ~3 arrivals per stop), but popping in reads as a bug.
        const marker = L.marker([b.lat, b.lon], { icon: busChipIcon(b.service_no), zIndexOffset: 500, opacity: 0 })
          .bindPopup(busPopupContent(b, onQuickAlarmBus))
          .addTo(map);
        setTimeout(() => marker.setOpacity(1), 60);
        store.current.set(b.id, { marker, fix, vel, pos: { lat: b.lat, lon: b.lon }, lastSeen: now });
      }
    });
    // Absent buses get a grace window before removal — a single failed poll or
    // feed flicker must not blink them off the map. (Prediction pauses on its
    // own via PREDICT_CAP_S while they wait.)
    store.current.forEach((m, id) => {
      if (!seen.has(id) && now - (m.lastSeen ?? 0) > GRACE_MS) {
        map.removeLayer(m.marker);
        store.current.delete(id);
      }
    });
  }, [buses, map]);

  useEffect(() => () => {
    store.current.forEach((m) => map.removeLayer(m.marker));
    store.current.clear();
  }, [map]);

  return null;
}

/** Popup body that loads a station's live arrivals when opened. Shows only
 *  "my watching buses" by default; chips toggle watching in/out. */
function StopArrivalsPopup({ stop, onAlarmStop, watchedBuses, onToggleWatchBus }) {
  const [services, setServices] = useState(null);
  const [error, setError] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    getArrivals(stop.id)
      .then((d) => alive && setServices(d.services))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [stop.id]);

  const isWatching = (s) => watchedBuses?.has(`${stop.id}:${s.service_no}`);
  const watching = (services || []).filter(isWatching);
  const visible = services ? (showAll || watching.length === 0 ? services : watching) : [];
  // Toggling while the full list is visible keeps it expanded, so picking the
  // first bus doesn't fold the popup while the user adds more.
  const toggle = (no) => {
    if (showAll || watching.length === 0) setShowAll(true);
    onToggleWatchBus && onToggleWatchBus(stop.id, stop.name, no);
  };

  return (
    <div style={{ minWidth: 190 }}>
      <strong style={{ color: '#172B4D' }}>{stop.name}</strong>{' '}
      <span style={{ color: '#8794AD', fontSize: 11 }}>{stop.id}</span>
      {error && <div style={{ fontSize: 12 }}>Couldn't load arrivals</div>}
      {!services && !error && <div style={{ fontSize: 12 }}>Loading arrivals…</div>}
      {services && services.length === 0 && <div style={{ fontSize: 12 }}>No services here</div>}
      {visible.map((s) => (
        <div key={s.service_no} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 5 }}>
          <button
            title={isWatching(s) ? 'Watching — click to remove' : 'Click to add to my watching buses'}
            onClick={() => toggle(s.service_no)}
            style={{
              background: isWatching(s) ? ORANGE : '#fff',
              color: isWatching(s) ? '#fff' : '#8794AD',
              border: isWatching(s) ? `1.5px solid ${ORANGE}` : '1.5px solid #E3E6EC',
              borderRadius: 6, padding: '1px 7px', fontWeight: 700, minWidth: 34,
              textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
            }}>
            {s.service_no}
          </button>
          <span>{s.etas.map((e) => (e <= 0 ? 'Arr' : `${e}m`)).join(' · ') || 'no timing'}</span>
        </div>
      ))}
      {services && watching.length > 0 && watching.length < services.length && (
        <button
          style={{ marginTop: 6, background: 'none', border: 'none', color: '#0080C6', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
          onClick={() => setShowAll(!showAll)}>
          {showAll ? '▲ Only my watching buses' : `▼ Show all ${services.length} buses`}
        </button>
      )}
      {onAlarmStop && (
        <button
          style={{ marginTop: 10, width: '100%', background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
          onClick={() => onAlarmStop(stop)}>
          ⏰ Set alarm for this stop
        </button>
      )}
    </div>
  );
}

export default function BusMap({
  target, stops = [], buses = [], active = true,
  onPickPoint, onMapMove, onAlarmStop, onQuickAlarm, onQuickAlarmBus,
  watchedBuses, onToggleWatchBus, center,
}) {
  const explore = !target;
  const points = explore
    ? (center ? [center] : stops.map((s) => [s.lat, s.lon]))
    : target.type === 'bus'
      ? target.positions.map((p) => [p.lat, p.lon])
      : target.route.polyline;

  return (
    <MapContainer center={points[0] ?? [1.2975, 103.854]} zoom={15} zoomControl={false}
      style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <ZoomControl position="bottomright" />
      <FitBounds points={points} />
      <InvalidateOnActive active={active} />
      {explore && onPickPoint && <ClickCatcher onPickPoint={onPickPoint} />}
      {explore && onMapMove && <MoveCatcher onMapMove={onMapMove} />}
      {explore && center && (
        <Marker position={center} icon={placeIcon}><Popup>Selected location</Popup></Marker>
      )}
      {explore && <AnimatedBuses buses={buses} onQuickAlarmBus={onQuickAlarmBus} />}
      {explore && stops.map((s) => (
        <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={6}
          pathOptions={{ color: ORANGE, weight: 3, fillColor: '#fff', fillOpacity: 1 }}>
          <Popup><StopArrivalsPopup stop={s} onAlarmStop={onAlarmStop}
            watchedBuses={watchedBuses} onToggleWatchBus={onToggleWatchBus} /></Popup>
        </CircleMarker>
      ))}
      {!explore && target.type === 'bus' &&
        target.positions.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lon]} icon={busIcon}>
            <Popup>
              <div style={{ fontSize: 12 }}>Bus {target.serviceNo} → {target.stopName}</div>
              {onQuickAlarm && (
                <button
                  style={{ marginTop: 8, width: '100%', background: ORANGE, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 10px', fontFamily: 'inherit', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                  onClick={(e) => {
                    e.currentTarget.textContent = '✅ Alarm set';
                    onQuickAlarm(target.serviceNo, target.stopId, target.stopName);
                  }}>
                  🔔 Alarm this bus (next 30 min)
                </button>
              )}
            </Popup>
          </Marker>
        ))}
      {!explore && target.type === 'route' && (
        <>
          <Polyline positions={target.route.polyline} pathOptions={{ color: '#0080C6', weight: 5, opacity: 0.85 }} />
          {target.route.stops.map((s) => (
            <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={5}
              pathOptions={{ color: ORANGE, weight: 3, fillColor: '#fff', fillOpacity: 1 }}>
              <Popup><StopArrivalsPopup stop={s} onAlarmStop={onAlarmStop}
                watchedBuses={watchedBuses} onToggleWatchBus={onToggleWatchBus} /></Popup>
            </CircleMarker>
          ))}
        </>
      )}
    </MapContainer>
  );
}
