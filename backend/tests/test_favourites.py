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


def test_favourites_crud_roundtrip():
    created = client.post(
        "/api/favourites",
        json={"stop_id": "01012", "custom_name": "Home stop", "group_name": "Coming back"},
    ).json()
    assert created["custom_name"] == "Home stop"

    listed = client.get("/api/favourites").json()["favourites"]
    assert len(listed) == 1
    assert listed[0]["group_name"] == "Coming back"

    assert client.patch(
        f"/api/favourites/{created['id']}", json={"custom_name": "Work stop"}
    ).json() == {"ok": True}
    assert client.get("/api/favourites").json()["favourites"][0]["custom_name"] == "Work stop"

    assert client.delete(f"/api/favourites/{created['id']}").json() == {"ok": True}
    assert client.get("/api/favourites").json()["favourites"] == []


def test_group_defaults_to_going_out():
    created = client.post(
        "/api/favourites", json={"stop_id": "01059", "custom_name": "Bugis"}
    ).json()
    assert created["group_name"] == "Going out"


def test_missing_favourite_404():
    assert client.patch("/api/favourites/9999", json={"custom_name": "x"}).status_code == 404
    assert client.delete("/api/favourites/9999").status_code == 404
