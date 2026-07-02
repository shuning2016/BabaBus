from dataclasses import asdict

from fastapi import APIRouter, HTTPException

from ..deps import get_datasource

router = APIRouter(prefix="/api/services")


@router.get("/{service_no}/route")
def route(service_no: str):
    r = get_datasource().get_route(service_no)
    if r is None:
        raise HTTPException(404, f"Unknown service {service_no}")
    return {
        "service_no": r.service_no,
        "stops": [asdict(s) for s in r.stops],
        "polyline": r.polyline,
    }
