import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useEffect, useState } from 'react';
import { getArrivals } from '../api';

const busIcon = L.divIcon({
  className: '',
  html: '<div style="background:#EE4D2D;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 1px 4px rgba(0,0,0,.4)">🚌</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Small labelled chip for live buses on the explore map
const busChipIcon = (serviceNo) =>
  L.divIcon({
    className: '',
    html: `<div style="background:#EE4D2D;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700;white-space:nowrap;display:inline-block;box-shadow:0 1px 4px rgba(0,0,0,.4)">🚌 ${serviceNo}</div>`,
    iconSize: [44, 18],
    iconAnchor: [22, 9],
  });

const placeIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:28px;line-height:28px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))">📍</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function FitBounds({ points }) {
  const map = useMap();
  const signature = JSON.stringify(points);
  useEffect(() => {
    const pts = JSON.parse(signature);
    if (pts.length === 1) map.setView(pts[0], 16);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] });
  }, [map, signature]);
  return null;
}

function ClickCatcher({ onPickPoint }) {
  useMapEvents({ click: (e) => onPickPoint(e.latlng.lat, e.latlng.lng) });
  return null;
}

function MoveCatcher({ onMapMove }) {
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter();
      onMapMove(c.lat, c.lng);
    },
  });
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
    <div style={{ minWidth: 170 }}>
      <strong>{stop.name}</strong>{' '}
      <span style={{ color: '#777', fontSize: 11 }}>{stop.id}</span>
      {error && <div style={{ fontSize: 12 }}>Couldn't load arrivals</div>}
      {!services && !error && <div style={{ fontSize: 12 }}>Loading arrivals…</div>}
      {services && services.length === 0 && <div style={{ fontSize: 12 }}>No services here</div>}
      {services && services.map((s) => (
        <div key={s.service_no} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 4 }}>
          <span style={{ background: '#EE4D2D', color: '#fff', borderRadius: 4, padding: '0 6px', fontWeight: 700 }}>
            {s.service_no}
          </span>
          <span>{s.etas.map((e) => (e <= 0 ? 'Arr' : `${e}m`)).join(' · ')}</span>
        </div>
      ))}
    </div>
  );
}

export default function BusMap({ target, stops = [], buses = [], onPickPoint, onMapMove, center }) {
  const explore = !target;
  // In explore mode, only recenter when the picked place changes — never on
  // stop updates, so panning the map doesn't get yanked back by FitBounds.
  const points = explore
    ? (center ? [center] : stops.map((s) => [s.lat, s.lon]))
    : target.type === 'bus'
      ? target.positions.map((p) => [p.lat, p.lon])
      : target.route.polyline;

  return (
    <MapContainer center={points[0] ?? [1.2975, 103.854]} zoom={15} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {explore && onPickPoint && <ClickCatcher onPickPoint={onPickPoint} />}
      {explore && onMapMove && <MoveCatcher onMapMove={onMapMove} />}
      {explore && center && (
        <Marker position={center} icon={placeIcon}>
          <Popup>Selected location</Popup>
        </Marker>
      )}
      {explore && buses.map((b) => (
        <Marker key={`${b.service_no}:${b.lat}:${b.lon}`} position={[b.lat, b.lon]}
          icon={busChipIcon(b.service_no)} zIndexOffset={500}>
          <Popup>Bus {b.service_no} — heading to {b.toward}</Popup>
        </Marker>
      ))}
      {explore && stops.map((s) => (
        <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={8}
          pathOptions={{ color: '#EE4D2D', fillColor: '#fff', fillOpacity: 1 }}>
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
          <Polyline positions={target.route.polyline} pathOptions={{ color: '#0080C6', weight: 5 }} />
          {target.route.stops.map((s) => (
            <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={6}
              pathOptions={{ color: '#EE4D2D', fillColor: '#fff', fillOpacity: 1 }}>
              <Popup><StopArrivalsPopup stop={s} /></Popup>
            </CircleMarker>
          ))}
        </>
      )}
    </MapContainer>
  );
}
