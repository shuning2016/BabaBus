from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_demo_mode_without_key():
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "mode": "demo"}


def test_health_reports_live_mode_with_key(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "lta_account_key", "test-key")
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "mode": "live"}
