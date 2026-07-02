from app.datasource.demo import HEADWAY_SECONDS, HOP_SECONDS, DemoDataSource


def fixed(t):
    return lambda: float(t)


def test_route_lookup():
    ds = DemoDataSource(now_fn=fixed(0))
    route = ds.get_route("7")
    assert [s.id for s in route.stops] == ["01012", "01013", "01029", "01039", "01059"]
    assert route.polyline[0] == [route.stops[0].lat, route.stops[0].lon]
    assert ds.get_route("999") is None


def test_service_nos():
    ds = DemoDataSource(now_fn=fixed(0))
    assert ds.get_service_nos() == ["175", "32", "7"]  # sorted as strings


def test_etas_are_deterministic_at_t0():
    ds = DemoDataSource(now_fn=fixed(0))
    arrivals = {a.service_no: a for a in ds.get_arrivals("01029")}
    # 01029 is index 2 on service 7: bus k=0 arrives at 240s -> 4 min, then +8, +16
    assert arrivals["7"].etas == [4, 12, 20]
    assert arrivals["7"].prev_interval_min == HEADWAY_SECONDS // 60
    assert arrivals["7"].load in ("SEA", "SDA", "LSD")


def test_etas_advance_with_time():
    later = DemoDataSource(now_fn=fixed(120)).get_arrivals("01029")
    svc7 = {a.service_no: a for a in later}["7"]
    assert svc7.etas == [2, 10, 18]


def test_bus_positions_on_route():
    ds = DemoDataSource(now_fn=fixed(60))  # bus k=0 is halfway hop 0 on every service
    arrivals = {a.service_no: a for a in ds.get_arrivals("01059")}
    assert len(arrivals["7"].bus_positions) >= 1
    pos = arrivals["7"].bus_positions[0]
    assert 1.28 < pos["lat"] < 1.31 and 103.84 < pos["lon"] < 103.86


def test_arrivals_only_for_serving_services():
    ds = DemoDataSource(now_fn=fixed(0))
    assert {a.service_no for a in ds.get_arrivals("02049")} == {"175"}
