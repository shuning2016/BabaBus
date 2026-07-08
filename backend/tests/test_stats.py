import time

import pytest
from fastapi.testclient import TestClient

from app import db
from app.config import settings
from app.main import app

SECRET = "test-secret"


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "push_secret", SECRET)
    db.init_db()
    yield


client = TestClient(app)


def test_stats_requires_secret():
    assert client.get("/api/stats").status_code == 403
    assert client.get("/api/stats", params={"secret": "wrong"}).status_code == 403


def test_stats_counts_distinct_owners_across_tables():
    now = int(time.time())
    # device-a: favourite + fresh location; device-b: alarm; acct-1: push sub
    db.add_favourite("01029", "Home", "Going out", owner="device-a")
    db.set_location("device-a", 1.3, 103.8, now - 60)
    db.add_schedule("01029", "7", "06:00", "09:00", owner="device-b")
    db.add_subscription("https://push.example/x", "k", "a", owner="acct-1")
    db.upsert_account("acct-1", "google", "uid-1", "e@x.com", "E", None, now)
    db.set_location("device-old", 1.3, 103.8, now - 30 * 86400)  # inactive straggler

    body = client.get("/api/stats", params={"secret": SECRET}).json()
    assert body["users_total"] == 4          # a, b, acct-1, device-old
    assert body["registered_accounts"] == 1
    assert body["devices_with_push"] == 1
    assert body["active_last_7d"] == 1       # only device-a's fix is fresh
    assert body["active_last_24h"] == 1
    assert body["favourites"] == 1
    assert body["alarms"] == 1 and body["alarms_enabled"] == 1
