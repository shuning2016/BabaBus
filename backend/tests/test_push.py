import pytest
from fastapi.testclient import TestClient

from app import db
from app.alarms import within_window
from app.config import settings
from app.main import app
from app.routers import push as push_router

SECRET = "test-secret"
ALL_DAY = {"start_time": "00:00", "end_time": "23:59"}


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "push_secret", SECRET)
    db.init_db()
    yield


client = TestClient(app)


def test_within_window():
    assert within_window(400, "06:40", "07:00") is True
    assert within_window(399, "06:40", "07:00") is False
    assert within_window(420, "06:40", "07:00") is False   # 07:00 exclusive
    assert within_window(10, "23:30", "00:15") is True      # crosses midnight
    assert within_window(20, "23:30", "00:15") is False


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
    client.post("/api/schedules", json={"stop_id": "01029", "service_no": "7", "label": "7 @ Natl Lib", **ALL_DAY})

    first = client.post("/api/push/tick", params={"secret": SECRET}).json()
    assert len(first["pushed"]) == 1
    assert len(sent) == 1
    assert "7 @ Natl Lib" in sent[0]["body"]

    # second tick immediately after — interval (4 min) not elapsed, so no push
    second = client.post("/api/push/tick", params={"secret": SECRET}).json()
    assert second["pushed"] == []
    assert len(sent) == 1


def test_tick_noop_without_subscribers(monkeypatch):
    monkeypatch.setattr(push_router, "send_web_push", lambda sub, payload: None)
    client.post("/api/schedules", json={"stop_id": "01029", "service_no": "7", "label": "x", **ALL_DAY})
    body = client.post("/api/push/tick", params={"secret": SECRET}).json()
    assert body["subscribers"] == 0 and body["pushed"] == []


def test_remind_every_persists():
    created = client.post("/api/schedules", json={
        "stop_id": "01029", "service_no": "7", "start_time": "06:40", "end_time": "07:00", "remind_every": 2,
    }).json()
    assert created["remind_every"] == 2
    got = client.get("/api/schedules").json()["schedules"][0]
    assert got["remind_every"] == 2
    assert client.patch(f"/api/schedules/{created['id']}", json={"remind_every": 10}).json() == {"ok": True}
    assert client.get("/api/schedules").json()["schedules"][0]["remind_every"] == 10
