import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { useEffect, useRef, useState } from 'react';
import { getArrivals } from '../api';

const ORANGE = '#EE4D2D';
const ANIM_MS = 15000; // buses glide toward their latest position over one poll cycle

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

/** Live buses rendered as Leaflet markers that tween smoothly toward each
 *  new position (requestAnimationFrame) so they appear to drive along roads. */
function AnimatedBuses({ buses }) {
  const map = useMap();
  const store = useRef(new Map()); // id -> { marker, from, to, start }

  useEffect(() => {
    let raf;
    const tick = () => {
      const now = performance.now();
      store.current.forEach((m) => {
        const t = Math.min(1, (now - m.start) / ANIM_MS);
        m.marker.setLatLng([
          m.from.lat + (m.to.lat - m.from.lat) * t,
          m.from.lon + (m.to.lon - m.from.lon) * t,
        ]);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const seen = new Set();
    buses.forEach((b) => {
      seen.add(b.id);
      const label = `Bus ${b.service_no} — heading to ${b.toward}`;
      const existing = store.current.get(b.id);
      if (existing) {
        const cur = existing.marker.getLatLng();
        existing.from = { lat: cur.lat, lon: cur.lng };
        existing.to = { lat: b.lat, lon: b.lon };
        existing.start = performance.now();
        existing.marker.setPopupContent(label);
      } else {
        const marker = L.marker([b.lat, b.lon], { icon: busChipIcon(b.service_no), zIndexOffset: 500 })
          .bindPopup(label)
          .addTo(map);
        store.current.set(b.id, {
          marker, from: { lat: b.lat, lon: b.lon }, to: { lat: b.lat, lon: b.lon }, start: performance.now(),
        });
      }
    });
    store.current.forEach((m, id) => {
      if (!seen.has(id)) { map.removeLayer(m.marker); store.current.delete(id); }
    });
  }, [buses, map]);

  useEffect(() => () => {
    store.current.forEach((m) => map.removeLayer(m.marker));
    store.current.clear();
  }, [map]);

  return null;
}

/** Popup body that loads a station's live arrivals when opened. */
function StopArrivalsPopup({ stop }) {
  const [services, setServices] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getArrivals(stop.id)
      .then((d) => alive && setServices(d.services))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [stop.id]);

  return (
    <div style={{ minWidth: 180 }}>
      <strong style={{ color: '#172B4D' }}>{stop.name}</strong>{' '}
      <span style={{ color: '#8794AD', fontSize: 11 }}>{stop.id}</span>
      {error && <div style={{ fontSize: 12 }}>Couldn't load arrivals</div>}
      {!services && !error && <div style={{ fontSize: 12 }}>Loading arrivals…</div>}
      {services && services.length === 0 && <div style={{ fontSize: 12 }}>No services here</div>}
      {services && services.map((s) => (
        <div key={s.service_no} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 5 }}>
          <span style={{ background: ORANGE, color: '#fff', borderRadius: 6, padding: '1px 7px', fontWeight: 700, minWidth: 34, textAlign: 'center' }}>
            {s.service_no}
          </span>
          <span>{s.etas.map((e) => (e <= 0 ? 'Arr' : `${e}m`)).join(' · ') || 'no timing'}</span>
        </div>
      ))}
    </div>
  );
}

export default function BusMap({ target, stops = [], buses = [], active = true, onPickPoint, onMapMove, center }) {
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
      {explore && <AnimatedBuses buses={buses} />}
      {explore && stops.map((s) => (
        <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={6}
          pathOptions={{ color: ORANGE, weight: 3, fillColor: '#fff', fillOpacity: 1 }}>
          <Popup><StopArrivalsPopup stop={s} /></Popup>
        </CircleMarker>
      ))}
      {!explore && target.type === 'bus' &&
        target.positions.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lon]} icon={busIcon}>
            <Popup>Bus {target.serviceNo} → {target.stopName}</Popup>
          </Marker>
        ))}
      {!explore && target.type === 'route' && (
        <>
          <Polyline positions={target.route.polyline} pathOptions={{ color: '#0080C6', weight: 5, opacity: 0.85 }} />
          {target.route.stops.map((s) => (
            <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={5}
              pathOptions={{ color: ORANGE, weight: 3, fillColor: '#fff', fillOpacity: 1 }}>
              <Popup><StopArrivalsPopup stop={s} /></Popup>
            </CircleMarker>
          ))}
        </>
      )}
    </MapContainer>
  );
}
