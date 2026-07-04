import pytest
from fastapi.testclient import TestClient

from app import db
from app.config import settings
from app.main import app
from app.routers import auth as auth_router

FAKE_CLAIMS = {
    "aud": "test-client", "sub": "google-123", "email": "a@b.com",
    "email_verified": "true", "name": "Ada", "picture": "http://img/x.png",
}


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "test.db"))
    monkeypatch.setattr(settings, "google_client_id", "test-client")
    monkeypatch.setattr(auth_router, "_verify_google", lambda credential: FAKE_CLAIMS)
    db.init_db()
    yield


client = TestClient(app)
ALARM = {"stop_id": "01029", "services": ["7"], "start_time": "06:40", "end_time": "07:00", "label": "A"}


def test_google_signin_creates_account_and_session():
    r = client.post("/api/auth/google", json={"credential": "x"}, headers={"X-Device-Id": "dev1"}).json()
    assert r["account"]["name"] == "Ada" and r["account"]["email"] == "a@b.com"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {r['token']}"}).json()
    assert me["account"]["email"] == "a@b.com"


def test_signin_migrates_device_data_to_account():
    dev = {"X-Device-Id": "dev2"}
    client.post("/api/schedules", json=ALARM, headers=dev)
    assert len(client.get("/api/schedules", headers=dev).json()["schedules"]) == 1

    token = client.post("/api/auth/google", json={"credential": "x"}, headers=dev).json()["token"]
    auth = {"Authorization": f"Bearer {token}"}
    # the alarm now belongs to the account, not the bare device
    assert len(client.get("/api/schedules", headers=auth).json()["schedules"]) == 1
    assert client.get("/api/schedules", headers=dev).json()["schedules"] == []


def test_me_requires_valid_token():
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_logout_invalidates_session():
    token = client.post("/api/auth/google", json={"credential": "x"}, headers={"X-Device-Id": "dev3"}).json()["token"]
    auth = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/auth/me", headers=auth).status_code == 200
    assert client.post("/api/auth/logout", headers=auth).json() == {"ok": True}
    assert client.get("/api/auth/me", headers=auth).status_code == 401


def test_same_google_identity_reuses_one_account():
    t1 = client.post("/api/auth/google", json={"credential": "x"}, headers={"X-Device-Id": "d1"}).json()["token"]
    t2 = client.post("/api/auth/google", json={"credential": "x"}, headers={"X-Device-Id": "d2"}).json()["token"]
    assert t1 != t2  # separate sessions
    assert len(db._run("SELECT id FROM accounts")["rows"]) == 1  # one account
