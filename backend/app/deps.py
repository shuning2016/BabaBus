from functools import lru_cache

from fastapi import Header, HTTPException

from . import db
from .cache import TTLCache
from .config import settings
from .datasource.base import DataSource
from .datasource.demo import DemoDataSource


def get_owner(
    authorization: str | None = Header(default=None),
    x_device_id: str | None = Header(default=None),
) -> str:
    """Resolve the data owner. A signed-in user (Bearer session token) owns data
    by account id; otherwise the anonymous device owns it by its X-Device-Id."""
    if authorization and authorization.lower().startswith("bearer "):
        account_id = db.get_session_account_id(authorization[7:].strip())
        if account_id:
            return account_id
    if x_device_id:
        return x_device_id
    raise HTTPException(400, "Missing X-Device-Id header")


@lru_cache
def get_datasource() -> DataSource:
    if settings.demo_mode:
        return DemoDataSource()
    from .datasource.lta import LTADataSource  # imported lazily; added in Task 7

    return LTADataSource(settings.lta_account_key)


@lru_cache
def get_cache() -> TTLCache:
    return TTLCache()
