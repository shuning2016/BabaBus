from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_nearby_returns_sorted_stops():
    res = client.get("/api/stops/nearby", params={"lat": 1.29685, "lon": 103.85254, "radius": 300, "limit": 3})
    assert res.status_code == 200
    stops = res.json()["stops"]
    assert stops[0]["id"] == "01012"
    assert stops[0]["distance_m"] == 0
    assert len(stops) == 3


def test_arrivals_shape():
    res = client.get("/api/stops/01029/arrivals")
    assert res.status_code == 200
    body = res.json()
    assert body["stop_name"] == "Opp Natl Lib"
    assert body["stale"] is False
    svc = body["services"][0]
    assert set(svc) == {"service_no", "etas", "load", "prev_interval_min", "bus_positions"}
    assert len(svc["etas"]) == 3


def test_arrivals_unknown_stop_404():
    assert client.get("/api/stops/99999/arrivals").status_code == 404


def test_search_by_service_number():
    body = client.get("/api/search", params={"q": "7"}).json()
    assert "7" in body["services"]


def test_search_by_name_and_road():
    body = client.get("/api/search", params={"q": "bugis"}).json()
    ids = {s["id"] for s in body["stops"]}
    assert {"01039", "01059", "01109"} <= ids


def test_search_by_stop_id():
    body = client.get("/api/search", params={"q": "01012"}).json()
    assert body["stops"][0]["id"] == "01012"


def test_route_endpoint():
    body = client.get("/api/services/7/route").json()
    assert [s["id"] for s in body["stops"]][0] == "01012"
    assert len(body["polyline"]) == 5
    assert client.get("/api/services/999/route").status_code == 404
