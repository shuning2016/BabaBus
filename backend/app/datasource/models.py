from dataclasses import dataclass, field


@dataclass
class Stop:
    id: str
    name: str
    road: str
    lat: float
    lon: float


@dataclass
class ServiceArrival:
    service_no: str
    etas: list[int]                      # minutes, up to 3
    load: str                            # SEA | SDA | LSD
    prev_interval_min: int
    bus_positions: list[dict] = field(default_factory=list)  # {"lat","lon"}


@dataclass
class Route:
    service_no: str
    stops: list[Stop]
    polyline: list[list[float]]          # [[lat, lon], ...]
