import pytest

from app.cache import TTLCache


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def test_caches_within_ttl():
    clock, calls = Clock(), []
    cache = TTLCache(now_fn=clock)
    fetch = lambda: calls.append(1) or "v1"
    assert cache.get_or_fetch("k", 15, fetch) == ("v1", False)
    clock.t = 10
    assert cache.get_or_fetch("k", 15, fetch) == ("v1", False)
    assert len(calls) == 1


def test_refetches_after_ttl():
    clock = Clock()
    cache = TTLCache(now_fn=clock)
    cache.get_or_fetch("k", 15, lambda: "v1")
    clock.t = 16
    assert cache.get_or_fetch("k", 15, lambda: "v2") == ("v2", False)


def test_serves_stale_on_fetch_error():
    clock = Clock()
    cache = TTLCache(now_fn=clock)
    cache.get_or_fetch("k", 15, lambda: "v1")
    clock.t = 16

    def boom():
        raise RuntimeError("upstream down")

    assert cache.get_or_fetch("k", 15, boom) == ("v1", True)


def test_raises_when_no_stale_copy():
    cache = TTLCache(now_fn=Clock())

    def boom():
        raise RuntimeError("upstream down")

    with pytest.raises(RuntimeError):
        cache.get_or_fetch("k", 15, boom)
