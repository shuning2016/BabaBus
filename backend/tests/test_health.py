from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_demo_mode_without_key():
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "mode": "demo"}
