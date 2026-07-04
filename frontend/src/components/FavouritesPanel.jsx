import FavouriteCard from './FavouriteCard';

/**
 * Favourites grouped as My Buses → Going out → Coming back, each favourite
 * showing its live arrivals inline.
 */
export default function FavouritesPanel({
  favourites, onShowBus, onShowRoute, onRename, onDelete, watched, toggleWatch,
}) {
  const buses = favourites.filter((f) => f.service_no);
  const stopFavs = favourites.filter((f) => !f.service_no);
  const stopGroups = [...new Set(stopFavs.map((f) => f.group_name))];

  if (!favourites.length) {
    return (
      <p className="empty">
        No favourites yet. On the <strong>Nearby</strong> tab, tap ⭐ on a stop or a bus
        timing to save it here — you'll see its live arrivals at a glance.
      </p>
    );
  }

  const section = (title, items) => (
    <div className="favsection" key={title}>
      <h4 className="sectiontitle">{title}</h4>
      {items.map((f) => (
        <FavouriteCard key={f.id} fav={f}
          onShowBus={onShowBus} onShowRoute={onShowRoute}
          onRename={onRename} onDelete={onDelete} watched={watched} toggleWatch={toggleWatch} />
      ))}
    </div>
  );

  return (
    <>
      {buses.length > 0 && section('My Buses', buses)}
      {stopGroups.map((g) => section(g, stopFavs.filter((f) => f.group_name === g)))}
    </>
  );
}
