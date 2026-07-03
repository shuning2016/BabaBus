from datetime import datetime, timedelta, timezone

from app.datasource.lta import LTADataSource


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


class FakeClient:
    """Maps (path, key params) to canned LTA payloads."""

    def __init__(self, payloads):
        self.payloads = payloads

    def get(self, url, params=None):
        params = params or {}
        path = url.rsplit("/", 1)[-1]
        if path == "BusStops":
            data = self.payloads["BusStops"] if params.get("$skip", 0) == 0 else []
            return FakeResponse({"value": data})
        if path == "BusRoutes":
            data = self.payloads["BusRoutes"] if params.get("$skip", 0) == 0 else []
            return FakeResponse({"value": data})
        if path == "BusArrivalv2":
            return FakeResponse(self.payloads["BusArrivalv2"])
        raise AssertionError(f"unexpected url {url}")


def iso_in(minutes):
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


PAYLOADS = {
    "BusStops": [
        {"BusStopCode": "01012", "Description": "Hotel Grand Pacific",
         "RoadName": "Victoria St", "Latitude": 1.29685, "Longitude": 103.85254},
        {"BusStopCode": "01013", "Description": "St. Joseph's Ch",
         "RoadName": "Victoria St", "Latitude": 1.29771, "Longitude": 103.85322},
    ],
    "BusRoutes": [
        {"ServiceNo": "7", "Direction": 1, "StopSequence": 1, "BusStopCode": "01012"},
        {"ServiceNo": "7", "Direction": 1, "StopSequence": 2, "BusStopCode": "01013"},
        {"ServiceNo": "7", "Direction": 2, "StopSequence": 1, "BusStopCode": "01013"},
    ],
    "BusArrivalv2": {
        "Services": [
            {
                "ServiceNo": "7",
                "NextBus": {"EstimatedArrival": iso_in(3), "Load": "SDA",
                            "Latitude": "1.2970", "Longitude": "103.8530"},
                "NextBus2": {"EstimatedArrival": iso_in(11), "Load": "SEA",
                             "Latitude": "0", "Longitude": "0"},
                "NextBus3": {"EstimatedArrival": iso_in(19), "Load": "SEA",
                             "Latitude": "1.2950", "Longitude": "103.8500"},
            }
        ]
    },
}


def make_source():
    return LTADataSource("test-key", client=FakeClient(PAYLOADS))


def test_stops_mapped_and_memoized():
    src = make_source()
    stops = src.get_stops()
    assert stops[0].id == "01012" and stops[0].road == "Victoria St"
    assert src.get_stops() is stops  # memoized


def test_route_uses_direction_1_in_sequence():
    route = make_source().get_route("7")
    assert [s.id for s in route.stops] == ["01012", "01013"]
    assert make_source().get_route("999") is None


def test_arrivals_mapping():
    arrivals = make_source().get_arrivals("01012")
    svc = arrivals[0]
    assert svc.service_no == "7"
    assert svc.etas == [3, 11, 19]
    assert svc.load == "SDA"
    assert svc.prev_interval_min == 8
    # zero-lat NextBus2 position is filtered out
    assert len(svc.bus_positions) == 2
    assert svc.bus_positions[0] == {"lat": 1.297, "lon": 103.853}
