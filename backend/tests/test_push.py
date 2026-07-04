from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import db
from app.alarms import active_on, within_window
from app.config import settings
from app.main import app
from app.routers import push as push_router

SGT = timezone(timedelta(hours=8))

SECRET = "test-secret"
ALL_DAY = {"start_time": "00:00", "end_time": "23:59"}


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "push_secret", SECRET)
    db.init_db()
    yield


client = TestClient(app, headers={"X-Device-Id": "test-device"})


def test_within_window():
    assert within_window(400, "06:40", "07:00") is True
    assert within_window(399, "06:40", "07:00") is False
    assert within_window(420, "06:40", "07:00") is False   # 07:00 exclusive
    assert within_window(10, "23:30", "00:15") is True      # crosses midnight
    assert within_window(20, "23:30", "00:15") is False


def test_active_on():
    assert active_on("1111111", 0) is True
    assert active_on("0111111", 0) is False   # Monday off
    assert active_on("1111111", 6) is True     # Sunday
    assert active_on("bad", 0) is False


def test_tick_skips_day_that_is_off(monkeypatch):
    sent = []
    monkeypatch.setattr(push_router, "send_web_push", lambda sub, payload: sent.append(payload))
    client.post("/api/push/subscribe", json={"endpoint": "e", "p256dh": "k", "auth": "a"})
    today = datetime.now(SGT).weekday()
    days_off_today = "".join("0" if i == today else "1" for i in range(7))
    client.post("/api/schedules", json={
        "stop_id": "01029", "services": ["7"], "label": "x", "days": days_off_today, **ALL_DAY,
    })
    body = client.post("/api/push/tick", params={"secret": SECRET}).json()
    assert body["pushed"] == [] and sent == []


def test_days_persist_and_validate():
    created = client.post("/api/schedules", json={
        "stop_id": "01029", "services": ["7"], "days": "1111100", **ALL_DAY,
    }).json()
    assert created["days"] == "1111100"
    assert client.get("/api/schedules").json()["schedules"][0]["days"] == "1111100"
    assert client.patch(f"/api/schedules/{created['id']}", json={"days": "1010101"}).json() == {"ok": True}
    assert client.get("/api/schedules").json()["schedules"][0]["days"] == "1010101"
    # bad masks rejected
    assert client.post("/api/schedules", json={"stop_id": "01029", "services": ["7"], "days": "111", **ALL_DAY}).status_code == 422
    assert client.patch(f"/api/schedules/{created['id']}", json={"days": "12345678"}).status_code == 422


def test_subscribe_roundtrip():
    sub = {"endpoint": "https://push.example/abc", "p256dh": "key", "auth": "tok"}
    assert client.post("/api/push/subscribe", json=sub).json() == {"ok": True}
    assert db.list_subscriptions()[0]["endpoint"] == sub["endpoint"]
    assert client.post("/api/push/unsubscribe", json=sub).json() == {"ok": True}
    assert db.list_subscriptions() == []


def test_tick_requires_secret():
    assert client.post("/api/push/tick").status_code == 403
    assert client.post("/api/push/tick", params={"secret": "wrong"}).status_code == 403


def test_tick_pushes_due_alarm_then_respects_interval(monkeypatch):
    sent = []
    monkeypatch.setattr(push_router, "send_web_push", lambda sub, payload: sent.append(payload))
    client.post("/api/push/subscribe", json={"endpoint": "e", "p256dh": "k", "auth": "a"})
    # 01029 is served by service 7 in the demo dataset
    client.post("/api/schedules", json={"stop_id": "01029", "services": ["7"], "label": "7 @ Natl Lib", **ALL_DAY})

    first = client.post("/api/push/tick", params={"secret": SECRET}).json()
    assert len(first["pushed"]) == 1
    assert len(sent) == 1
    assert sent[0]["title"] == "7 @ Natl Lib"
    assert "7:" in sent[0]["body"]  # "7: N min"

    # second tick immediately after — interval (4 min) not elapsed, so no push
    second = client.post("/api/push/tick", params={"secret": SECRET}).json()
    assert second["pushed"] == []
    assert len(sent) == 1


def test_tick_empty_services_pushes_all_buses(monkeypatch):
    sent = []
    monkeypatch.setattr(push_router, "send_web_push", lambda sub, payload: sent.append(payload))
    client.post("/api/push/subscribe", json={"endpoint": "e", "p256dh": "k", "auth": "a"})
    client.post("/api/schedules", json={"stop_id": "01029", "services": [], "label": "All @ stop", **ALL_DAY})
    client.post("/api/push/tick", params={"secret": SECRET})
    assert len(sent) == 1
    assert sent[0]["body"].count(":") >= 1  # at least one "service: eta"


def test_tick_noop_without_subscribers(monkeypatch):
    monkeypatch.setattr(push_router, "send_web_push", lambda sub, payload: None)
    client.post("/api/schedules", json={"stop_id": "01029", "services": ["7"], "label": "x", **ALL_DAY})
    body = client.post("/api/push/tick", params={"secret": SECRET}).json()
    assert body["subscribers"] == 0 and body["pushed"] == []


def _make_vapid_b64() -> str:
    """Generate a throwaway VAPID private key as base64-of-PKCS8-PEM."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    import base64 as _b64

    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return _b64.b64encode(pem).decode()


def test_send_web_push_loads_vapid_key(monkeypatch):
    """Regression: pywebpush 2.x funnels a PEM *string* through Vapid.from_string,
    which strips newlines and fails to parse it — every push then silently errors.
    send_web_push must build a Vapid object from the base64-of-PEM key instead."""
    from py_vapid import Vapid

    from app import push as push_mod

    monkeypatch.setattr(settings, "vapid_private_b64", _make_vapid_b64())
    captured = {}
    monkeypatch.setattr(push_mod, "webpush", lambda **kw: captured.update(kw))

    # Must not raise (old code raised ValueError deserializing the key here).
    push_mod.send_web_push(
        {"endpoint": "https://push.example/x", "p256dh": "k", "auth": "a"},
        {"title": "t", "body": "b"},
    )
    # And it must hand webpush a real Vapid signer, not a raw string.
    assert isinstance(captured["vapid_private_key"], Vapid)


def test_remind_every_persists():
    created = client.post("/api/schedules", json={
        "stop_id": "01029", "services": ["7"], "start_time": "06:40", "end_time": "07:00", "remind_every": 2,
    }).json()
    assert created["remind_every"] == 2
    got = client.get("/api/schedules").json()["schedules"][0]
    assert got["remind_every"] == 2
    assert client.patch(f"/api/schedules/{created['id']}", json={"remind_every": 10}).json() == {"ok": True}
    assert client.get("/api/schedules").json()["schedules"][0]["remind_every"] == 10


def test_is_apple():
    from app.routers.push import _is_apple

    assert _is_apple("https://web.push.apple.com/xyz") is True
    assert _is_apple("https://fcm.googleapis.com/xyz") is False


def test_tick_apple_every_5min_android_every_tick(monkeypatch):
    """iOS banners on every push, so Apple subs are re-alerted at most every 5
    minutes while Android subs refresh silently on every tick."""
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 7, 4, 8, 0, tzinfo=tz)  # Sat 08:00 SGT, inside ALL_DAY

    monkeypatch.setattr(push_router, "datetime", FixedDatetime)
    sent_to = []
    monkeypatch.setattr(push_router, "send_web_push", lambda sub, payload: sent_to.append(sub["endpoint"]))
    client.post("/api/push/subscribe", json={"endpoint": "https://web.push.apple.com/AAA", "p256dh": "k", "auth": "a"})
    client.post("/api/push/subscribe", json={"endpoint": "https://fcm.googleapis.com/BBB", "p256dh": "k", "auth": "a"})
    created = client.post("/api/schedules", json={"stop_id": "01029", "services": ["7"], "label": "x", **ALL_DAY}).json()
    now = int(datetime(2026, 7, 4, 8, 0, tzinfo=SGT).timestamp())

    # First push reaches both platforms.
    client.post("/api/push/tick", params={"secret": SECRET})
    assert any("apple" in e for e in sent_to)
    assert any("googleapis" in e for e in sent_to)

    # 2 min after the last Apple alert (< 5): Android refreshes, Apple stays quiet.
    sent_to.clear()
    db.set_last_push(created["id"], now - 120)
    db.set_last_apple_push(created["id"], now - 120)
    client.post("/api/push/tick", params={"secret": SECRET})
    assert any("googleapis" in e for e in sent_to)
    assert not any("apple" in e for e in sent_to)

    # 6 min after the last Apple alert (>= 5): Apple banners again.
    sent_to.clear()
    db.set_last_push(created["id"], now - 360)
    db.set_last_apple_push(created["id"], now - 360)
    client.post("/api/push/tick", params={"secret": SECRET})
    assert any("apple" in e for e in sent_to)


def test_apple_held_back_until_live_timing(monkeypatch):
    """Apple is alerted only once there's real timing to show — a 'no live
    timing' tick shouldn't spend an iOS banner on nothing."""
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 7, 4, 8, 0, tzinfo=tz)

    class EmptyDS:
        def get_arrivals(self, stop_id):
            return []

    monkeypatch.setattr(push_router, "datetime", FixedDatetime)
    monkeypatch.setattr(push_router, "get_datasource", lambda: EmptyDS())
    sent_to = []
    monkeypatch.setattr(push_router, "send_web_push", lambda sub, payload: sent_to.append(sub["endpoint"]))
    client.post("/api/push/subscribe", json={"endpoint": "https://web.push.apple.com/AAA", "p256dh": "k", "auth": "a"})
    client.post("/api/push/subscribe", json={"endpoint": "https://fcm.googleapis.com/BBB", "p256dh": "k", "auth": "a"})
    client.post("/api/schedules", json={"stop_id": "01029", "services": ["7"], "label": "x", **ALL_DAY})

    client.post("/api/push/tick", params={"secret": SECRET})
    # No live timing: Android still gets the refresh, Apple is held back for later.
    assert any("googleapis" in e for e in sent_to)
    assert not any("apple" in e for e in sent_to)
