import FavouriteCard from './FavouriteCard';

/**
 * Favourites grouped by stop: saved stop favourites keep their groups
 * ("Going out" / "Coming back"), and stops where buses are watched without a
 * saved stop favourite appear once under "My Buses" — bus info always lives
 * under its stop, never as separate per-bus cards.
 */
export default function FavouritesPanel({
  favourites, onShowBus, onShowRoute, onCreateStationAlarm,
  watchedBuses, onToggleWatchBus, onQuickAlarm, onRename, onDelete, onRemoveStop,
}) {
  const stopFavs = favourites.filter((f) => !f.service_no);
  const busFavs = favourites.filter((f) => f.service_no);

  // Stops with watched buses but no saved stop card → implicit stop entries
  const covered = new Set(stopFavs.map((f) => f.stop_id));
  const implicitStops = [
    ...new Map(
      busFavs.filter((f) => !covered.has(f.stop_id)).map((f) => [f.stop_id, { stop_id: f.stop_id }])
    ).values(),
  ];

  const stopGroups = [...new Set(stopFavs.map((f) => f.group_name))];

  if (!stopFavs.length && !implicitStops.length) {
    return (
      <p className="empty">
        No favourites yet. On the <strong>Nearby</strong> tab, tap ⭐ on a stop to save it here,
        or tap a bus number to start watching it — its stop will appear here automatically.
      </p>
    );
  }

  const card = (f, key) => (
    <FavouriteCard key={key} fav={f}
      onShowBus={onShowBus} onShowRoute={onShowRoute}
      onCreateStationAlarm={onCreateStationAlarm} onQuickAlarm={onQuickAlarm}
      watchedBuses={watchedBuses} onToggleWatchBus={onToggleWatchBus}
      onRename={onRename} onDelete={onDelete} onRemoveStop={onRemoveStop} />
  );

  return (
    <>
      {implicitStops.length > 0 && (
        <div className="favsection">
          <h4 className="sectiontitle">My Buses</h4>
          {implicitStops.map((f) => card(f, `implicit-${f.stop_id}`))}
        </div>
      )}
      {stopGroups.map((g) => (
        <div className="favsection" key={g}>
          <h4 className="sectiontitle">{g}</h4>
          {stopFavs.filter((f) => f.group_name === g).map((f) => card(f, f.id))}
        </div>
      ))}
    </>
  );
}
