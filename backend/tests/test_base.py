import json
from pathlib import Path

from app.datasource.base import DataSource, haversine_m
from app.datasource.models import Stop

DATA = Path(__file__).resolve().parent.parent / "app" / "data"


class StubSource(DataSource):
    def get_stops(self):
        return [Stop(**s) for s in json.loads((DATA / "stops.json").read_text())]

    def get_arrivals(self, stop_id):
        return []

    def get_route(self, service_no):
        return None

    def get_service_nos(self):
        return []


def test_haversine_zero_distance():
    assert haversine_m(1.3, 103.85, 1.3, 103.85) == 0


def test_haversine_known_distance():
    # ~111 m per 0.001 degree of latitude
    d = haversine_m(1.300, 103.85, 1.301, 103.85)
    assert 105 < d < 115


def test_nearby_sorted_and_limited():
    src = StubSource()
    pairs = src.get_stops_near(1.29685, 103.85254, radius_m=300, limit=3)
    assert len(pairs) == 3
    assert pairs[0][0].id == "01012"          # exact location match first
    assert pairs[0][1] < pairs[1][1] <= pairs[2][1]  # ascending distance


def test_nearby_respects_radius():
    src = StubSource()
    pairs = src.get_stops_near(1.28580, 103.85300, radius_m=100, limit=8)
    assert [s.id for s, _ in pairs] == ["02049"]  # Fullerton is isolated
