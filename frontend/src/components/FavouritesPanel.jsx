export default function FavouritesPanel({ favourites, onOpen, onRename, onDelete }) {
  const groups = [...new Set(favourites.map((f) => f.group_name))];
  if (!favourites.length) {
    return <p className="muted" style={{ color: '#9AA9C4' }}>Tap ⭐ on any stop to save it here.</p>;
  }
  return (
    <>
      {groups.map((g) => (
        <div className="group" key={g}>
          <h4>{g}</h4>
          {favourites.filter((f) => f.group_name === g).map((f) => (
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
