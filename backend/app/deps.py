from functools import lru_cache

from .cache import TTLCache
from .config import settings
from .datasource.base import DataSource
from .datasource.demo import DemoDataSource


@lru_cache
def get_datasource() -> DataSource:
    if settings.demo_mode:
        return DemoDataSource()
    from .datasource.lta import LTADataSource  # imported lazily; added in Task 7

    return LTADataSource(settings.lta_account_key)


@lru_cache
def get_cache() -> TTLCache:
    return TTLCache()
