import time


class TTLCache:
    """Per-key TTL cache that falls back to stale data when a fetch fails."""

    def __init__(self, now_fn=time.time):
        self.now_fn = now_fn
        self.store: dict[str, tuple[object, float]] = {}

    def get_or_fetch(self, key: str, ttl_seconds: float, fetch_fn):
        now = self.now_fn()
        hit = self.store.get(key)
        if hit is not None and now - hit[1] < ttl_seconds:
            return hit[0], False
        try:
            value = fetch_fn()
        except Exception:
            if hit is not None:
                return hit[0], True
            raise
        self.store[key] = (value, now)
        return value, False
