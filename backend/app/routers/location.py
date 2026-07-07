"""Last-known device location, reported by the app while it's open. The cron
tick uses it to tell the user which bus they can still catch if they head to
the alarm's stop right now."""
import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import db
from ..deps import get_owner

router = APIRouter(prefix="/api/location")


class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


@router.post("")
def report_location(loc: LocationIn, owner: str = Depends(get_owner)):
    db.set_location(owner, loc.lat, loc.lon, int(time.time()))
    return {"ok": True}
