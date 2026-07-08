"""Owner-only usage stats — aggregate counts, no personal data. Guarded by the
same secret as the push tick so only the operator can read it."""
import time

from fastapi import APIRouter, HTTPException, Query

from .. import db
from ..config import settings

router = APIRouter(prefix="/api/stats")


@router.get("")
def stats(secret: str = Query("")):
    if not settings.push_secret or secret != settings.push_secret:
        raise HTTPException(403, "bad secret")
    return db.usage_stats(int(time.time()))
