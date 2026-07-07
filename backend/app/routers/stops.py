from dataclasses import asdict

from fastapi import APIRouter, HTTPException

from ..deps import get_cache, get_datasource

router = APIRouter(prefix="/api/stops")

# Short enough that a map poll shortly after opening gets a genuinely fresh
# LTA snapshot (bus positions start moving sooner); still shields LTA from
# every card/map poller hitting the same stop at once.
ARRIVALS_TTL_SECONDS = 8


@router.get("/nearby")
def nearby(lat: float, lon: float, radius: float = 500, limit: int = 8):
    pairs = get_datasource().get_stops_near(lat, lon, radius, limit)
    return {
        "stops": [{**asdict(s), "distance_m": round(d)} for s, d in pairs]
    }


@router.get("/{stop_id}/arrivals")
def arrivals(stop_id: str):
    ds = get_datasource()
    stop = next((s for s in ds.get_stops() if s.id == stop_id), None)
    if stop is None:
        raise HTTPException(404, f"Unknown bus stop {stop_id}")
    services, stale = get_cache().get_or_fetch(
        f"arrivals:{stop_id}", ARRIVALS_TTL_SECONDS, lambda: ds.get_arrivals(stop_id)
    )
    return {
        "stop_id": stop.id,
        "stop_name": stop.name,
        "stale": stale,
        "services": [asdict(a) for a in services],
    }
