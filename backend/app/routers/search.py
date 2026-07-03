from dataclasses import asdict

import httpx
from fastapi import APIRouter

from ..deps import get_datasource

router = APIRouter(prefix="/api")


@router.get("/search")
def search(q: str):
    ds = get_datasource()
    ql = q.strip().lower()
    services = [n for n in ds.get_service_nos() if n.lower().startswith(ql)]
    stops = [
        s
        for s in ds.get_stops()
        if ql in s.name.lower() or ql in s.road.lower() or s.id.startswith(ql)
    ]
    geocoded = None
    if not stops and not services:
        geocoded = _onemap_geocode(q)
        if geocoded:
            pairs = ds.get_stops_near(geocoded["lat"], geocoded["lon"], 500, 8)
            stops = [s for s, _ in pairs]
    return {
        "services": services,
        "stops": [asdict(s) for s in stops],
        "geocoded": geocoded,
    }


def _onemap_geocode(q: str):
    """Free OneMap search — resolves postal codes and building names to coords."""
    try:
        r = httpx.get(
            "https://www.onemap.gov.sg/api/common/elastic/search",
            params={"searchVal": q, "returnGeom": "Y", "getAddrDetails": "N", "pageNum": 1},
            timeout=5,
        )
        results = r.json().get("results") or []
        if results:
            top = results[0]
            return {
                "lat": float(top["LATITUDE"]),
                "lon": float(top["LONGITUDE"]),
                "label": top.get("SEARCHVAL", q),
            }
    except Exception:
        pass
    return None
