import pytest
from fastapi.testclient import TestClient

from app import db
from app.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    db.init_db()
    yield


client = TestClient(app)

MORNING_143 = {
    "stop_id": "14131",
    "service_no": "143",
    "start_time": "06:40",
    "end_time": "07:00",
    "label": "Morning 143",
}


def test_schedule_crud_roundtrip():
    created = client.post("/api/schedules", json=MORNING_143).json()
    assert created["service_no"] == "143"
    assert created["enabled"] is True

    listed = client.get("/api/schedules").json()["schedules"]
    assert len(listed) == 1
    assert listed[0]["start_time"] == "06:40"
    assert listed[0]["enabled"] is True

    assert client.patch(
        f"/api/schedules/{created['id']}", json={"enabled": False}
    ).json() == {"ok": True}
    assert client.get("/api/schedules").json()["schedules"][0]["enabled"] is False

    assert client.patch(
        f"/api/schedules/{created['id']}", json={"start_time": "06:30", "end_time": "07:15"}
    ).json() == {"ok": True}
    updated = client.get("/api/schedules").json()["schedules"][0]
    assert (updated["start_time"], updated["end_time"]) == ("06:30", "07:15")

    assert client.delete(f"/api/schedules/{created['id']}").json() == {"ok": True}
    assert client.get("/api/schedules").json()["schedules"] == []


def test_schedules_sorted_by_start_time():
    client.post("/api/schedules", json={**MORNING_143, "start_time": "18:00", "end_time": "18:30"})
    client.post("/api/schedules", json=MORNING_143)
    starts = [s["start_time"] for s in client.get("/api/schedules").json()["schedules"]]
    assert starts == ["06:40", "18:00"]


def test_invalid_time_rejected():
    for bad in ("6:40", "24:00", "06:60", "0640", "morning"):
        res = client.post("/api/schedules", json={**MORNING_143, "start_time": bad})
        assert res.status_code == 422, bad


def test_missing_schedule_404():
    assert client.patch("/api/schedules/9999", json={"enabled": True}).status_code == 404
    assert client.delete("/api/schedules/9999").status_code == 404


def test_empty_patch_rejected():
    created = client.post("/api/schedules", json=MORNING_143).json()
    assert client.patch(f"/api/schedules/{created['id']}", json={}).status_code == 422
