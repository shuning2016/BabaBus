import CapacityBar from './CapacityBar';

/**
 * One service's live arrivals row — shared by the Nearby stop cards and the
 * Favourite cards so both look identical. Trailing actions are opt-in.
 */
export default function ArrivalRow({
  svc, stopId, stopName,
  onShowBus, onShowRoute, onFavouriteBus, onCreateAlarm, watched, toggleWatch,
  showSave = true, showWatch = true, showAlarm = true,
}) {
  return (
    <div className="row">
      <button className="svc-chip" title="View route on map"
        onClick={() => onShowRoute(svc.service_no)}>
        {svc.service_no}
      </button>
      <div className="etas">
        {svc.etas.length === 0 && <span className="eta-none">no timing</span>}
        {svc.etas.map((eta, i) => (
          <span key={i}
            className={`eta ${i === 0 ? 'eta-lead' : ''} ${eta <= 1 ? 'now' : ''}`}
            title="Show this bus on the map"
            onClick={() => onShowBus(stopId, svc.service_no, svc.bus_positions, stopName)}>
            {eta <= 0 ? 'Arr' : `${eta}${i === 0 ? ' min' : ''}`}
          </span>
        ))}
      </div>
      <CapacityBar load={svc.load} />
      <div className="rowactions">
        {showSave && onFavouriteBus && (
          <button className="plain" title="Save this bus to Favourites"
            onClick={() => onFavouriteBus({ id: stopId, name: stopName }, svc.service_no)}>⭐</button>
        )}
        {showWatch && (
          <button className="plain" title="Notify me when it's arriving"
            style={{ opacity: watched(stopId, svc.service_no) ? 1 : 0.35 }}
            onClick={() => toggleWatch(stopId, svc.service_no)}>🔔</button>
        )}
        {showAlarm && onCreateAlarm && (
          <button className="plain" title="Watch this bus at set times every day"
            onClick={() => onCreateAlarm({ id: stopId, name: stopName }, svc.service_no)}>⏰</button>
        )}
      </div>
    </div>
  );
}
