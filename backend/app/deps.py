from functools import lru_cache

from fastapi import Header, HTTPException

from .cache import TTLCache
from .config import settings
from .datasource.base import DataSource
from .datasource.demo import DemoDataSource


def get_owner(x_device_id: str | None = Header(default=None)) -> str:
    """Anonymous per-device identity: the client sends a stable random id in the
    X-Device-Id header so its favourites/alarms/subscriptions stay its own."""
    if not x_device_id:
        raise HTTPException(400, "Missing X-Device-Id header")
    return x_device_id


@lru_cache
def get_datasource() -> DataSource:
    if settings.demo_mode:
        return DemoDataSource()
    from .datasource.lta import LTADataSource  # imported lazily; added in Task 7

    return LTADataSource(settings.lta_account_key)


@lru_cache
def get_cache() -> TTLCache:
    return TTLCache()
