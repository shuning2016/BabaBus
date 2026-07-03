import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import { useEffect } from 'react';

const busIcon = L.divIcon({
  className: '',
  html: '<div style="background:#EE4D2D;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 1px 4px rgba(0,0,0,.4)">🚌</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
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

export default function BusMap({ target }) {
  if (!target) {
    return (
      <div style={{ padding: 20 }} className="muted">
        Click a bus timing to see the bus on the map, or a service number to see its route.
      </div>
    );
  }

  const points =
    target.type === 'bus'
      ? target.positions.map((p) => [p.lat, p.lon])
      : target.route.polyline;

  return (
    <MapContainer center={points[0] ?? [1.2975, 103.854]} zoom={15} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {target.type === 'bus' &&
        target.positions.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lon]} icon={busIcon}>
            <Popup>Bus {target.serviceNo} → {target.stopName}</Popup>
          </Marker>
        ))}
      {target.type === 'route' && (
        <>
          <Polyline positions={target.route.polyline} pathOptions={{ color: '#0080C6', weight: 5 }} />
          {target.route.stops.map((s) => (
            <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={6}
              pathOptions={{ color: '#EE4D2D', fillColor: '#fff', fillOpacity: 1 }}>
              <Popup>{s.name} ({s.id})</Popup>
            </CircleMarker>
          ))}
        </>
      )}
    </MapContainer>
  );
}
