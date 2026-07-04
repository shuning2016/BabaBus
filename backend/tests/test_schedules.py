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


client = TestClient(app, headers={"X-Device-Id": "test-device"})

MORNING = {
    "stop_id": "14131",
    "services": ["143", "61"],
    "start_time": "06:40",
    "end_time": "07:00",
    "label": "Morning @ Caribbean",
}


def test_schedule_crud_roundtrip():
    created = client.post("/api/schedules", json=MORNING).json()
    assert created["services"] == ["143", "61"]
    assert created["enabled"] is True

    listed = client.get("/api/schedules").json()["schedules"]
    assert len(listed) == 1
    assert listed[0]["services"] == ["143", "61"]
    assert listed[0]["start_time"] == "06:40"

    # edit monitored buses
    assert client.patch(
        f"/api/schedules/{created['id']}", json={"services": ["143", "61", "131"]}
    ).json() == {"ok": True}
    assert client.get("/api/schedules").json()["schedules"][0]["services"] == ["143", "61", "131"]

    assert client.patch(
        f"/api/schedules/{created['id']}", json={"start_time": "06:30", "end_time": "07:15"}
    ).json() == {"ok": True}
    updated = client.get("/api/schedules").json()["schedules"][0]
    assert (updated["start_time"], updated["end_time"]) == ("06:30", "07:15")

    assert client.delete(f"/api/schedules/{created['id']}").json() == {"ok": True}
    assert client.get("/api/schedules").json()["schedules"] == []


def test_empty_services_means_all_buses():
    created = client.post("/api/schedules", json={**MORNING, "services": []}).json()
    assert created["services"] == []
    assert client.get("/api/schedules").json()["schedules"][0]["services"] == []


def test_legacy_single_service_backfills_to_list():
    # simulate a pre-refactor row that only had service_no
    db.add_schedule("14131", "", "06:40", "07:00", "legacy", owner="test-device")
    db._run("UPDATE schedules SET services = '', service_no = '99'")
    got = client.get("/api/schedules").json()["schedules"][0]
    assert got["services"] == ["99"]  # falls back to legacy service_no


def test_device_isolation():
    # Two devices keep separate alarm lists.
    client.post("/api/schedules", json=MORNING, headers={"X-Device-Id": "aaa"})
    mine = client.get("/api/schedules", headers={"X-Device-Id": "aaa"}).json()["schedules"]
    theirs = client.get("/api/schedules", headers={"X-Device-Id": "bbb"}).json()["schedules"]
    assert len(mine) == 1 and theirs == []
    # device bbb can't delete device aaa's alarm
    assert client.delete(f"/api/schedules/{mine[0]['id']}", headers={"X-Device-Id": "bbb"}).status_code == 404
    assert client.delete(f"/api/schedules/{mine[0]['id']}", headers={"X-Device-Id": "aaa"}).json() == {"ok": True}


def test_missing_device_id_rejected():
    bare = TestClient(app)  # no default X-Device-Id
    assert bare.get("/api/schedules").status_code == 400
    assert bare.post("/api/schedules", json=MORNING).status_code == 400


def test_schedules_sorted_by_start_time():
    client.post("/api/schedules", json={**MORNING, "start_time": "18:00", "end_time": "18:30"})
    client.post("/api/schedules", json=MORNING)
    starts = [s["start_time"] for s in client.get("/api/schedules").json()["schedules"]]
    assert starts == ["06:40", "18:00"]


def test_invalid_time_rejected():
    for bad in ("6:40", "24:00", "06:60", "0640", "morning"):
        res = client.post("/api/schedules", json={**MORNING, "start_time": bad})
        assert res.status_code == 422, bad


def test_missing_schedule_404():
    assert client.patch("/api/schedules/9999", json={"enabled": True}).status_code == 404
    assert client.delete("/api/schedules/9999").status_code == 404


def test_empty_patch_rejected():
    created = client.post("/api/schedules", json=MORNING).json()
    assert client.patch(f"/api/schedules/{created['id']}", json={}).status_code == 422
