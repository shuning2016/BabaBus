import { useEffect, useState } from 'react';
import { getArrivals } from '../api';

const ETA_POLL_MS = 30000;

/** Sidebar row for a favourited bus: shows its next ETA live. */
function BusFavRow({ fav, onOpenBus, onRename, onDelete, watched, toggleWatch }) {
  const [eta, setEta] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getArrivals(fav.stop_id)
        .then((d) => {
          if (!alive) return;
          const svc = d.services.find((s) => s.service_no === fav.service_no);
          setEta(svc && svc.etas.length ? svc.etas[0] : null);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, ETA_POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [fav.stop_id, fav.service_no]);

  return (
    <div className="fav" onClick={() => onOpenBus(fav)}>
      🚌 {fav.custom_name}
      {eta != null && <span className="favchip">{eta <= 0 ? 'Arr' : `${eta}m`}</span>}
      <span className="actions">
        <button className="plain" title="Auto-watch: notify me when it's arriving"
          style={{ opacity: watched(fav.stop_id, fav.service_no) ? 1 : 0.4 }}
          onClick={(e) => { e.stopPropagation(); toggleWatch(fav); }}>🔔</button>
        <button className="plain" title="Rename"
          onClick={(e) => { e.stopPropagation(); onRename(fav.id); }}>✏️</button>
        <button className="plain" title="Remove"
          onClick={(e) => { e.stopPropagation(); onDelete(fav.id); }}>🗑</button>
      </span>
    </div>
  );
}

export default function FavouritesPanel({
  favourites, onOpen, onOpenBus, onRename, onDelete, watched, toggleWatch,
}) {
  const buses = favourites.filter((f) => f.service_no);
  const stopFavs = favourites.filter((f) => !f.service_no);
  const groups = [...new Set(stopFavs.map((f) => f.group_name))];

  if (!favourites.length) {
    return <p className="muted" style={{ color: '#9AA9C4' }}>Tap ⭐ on any stop or bus timing row to save it here.</p>;
  }
  return (
    <>
      {buses.length > 0 && (
        <div className="group">
          <h4>My Buses</h4>
          {buses.map((f) => (
            <BusFavRow key={f.id} fav={f} onOpenBus={onOpenBus}
              onRename={onRename} onDelete={onDelete}
              watched={watched} toggleWatch={toggleWatch} />
          ))}
        </div>
      )}
      {groups.map((g) => (
        <div className="group" key={g}>
          <h4>{g}</h4>
          {stopFavs.filter((f) => f.group_name === g).map((f) => (
            <div className="fav" key={f.id} onClick={() => onOpen(f.stop_id)}>
              🚏 {f.custom_name}
              <span className="actions">
                <button className="plain" title="Rename"
                  onClick={(e) => { e.stopPropagation(); onRename(f.id); }}>✏️</button>
                <button className="plain" title="Remove"
                  onClick={(e) => { e.stopPropagation(); onDelete(f.id); }}>🗑</button>
              </span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
