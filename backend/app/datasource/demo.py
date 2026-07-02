import json
import math
import time
from pathlib import Path
from typing import Optional

from .base import DataSource
from .models import Route, ServiceArrival, Stop

HOP_SECONDS = 120
HEADWAY_SECONDS = 480
LOADS = ["SEA", "SDA", "LSD"]
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class DemoDataSource(DataSource):
    """Simulates buses moving along real Singapore route geometry.

    Buses depart the origin at every multiple of HEADWAY_SECONDS (epoch time)
    and take HOP_SECONDS per hop, so all output is a pure function of now_fn().
    """

    def __init__(self, now_fn=time.time):
        self.now_fn = now_fn
        raw = json.loads((DATA_DIR / "stops.json").read_text())
        self.stops = {s["id"]: Stop(**s) for s in raw}
        self.routes: dict[str, list[str]] = json.loads(
            (DATA_DIR / "services.json").read_text()
        )

    def get_stops(self) -> list[Stop]:
        return list(self.stops.values())

    def get_service_nos(self) -> list[str]:
        return sorted(self.routes.keys())

    def get_route(self, service_no: str) -> Optional[Route]:
        ids = self.routes.get(service_no)
        if not ids:
            return None
        stops = [self.stops[i] for i in ids]
        return Route(service_no, stops, [[s.lat, s.lon] for s in stops])

    def get_arrivals(self, stop_id: str) -> list[ServiceArrival]:
        now = self.now_fn()
        out = []
        for service_no, ids in sorted(self.routes.items()):
            if stop_id not in ids:
                continue
            i = ids.index(stop_id)
            arrival_offset = i * HOP_SECONDS
            k_min = math.ceil((now - arrival_offset) / HEADWAY_SECONDS)
            etas = [
                round(((k_min + j) * HEADWAY_SECONDS + arrival_offset - now) / 60)
                for j in range(3)
            ]
            load = LOADS[(int(now // 300) + i + sum(ord(c) for c in service_no)) % 3]
            out.append(
                ServiceArrival(
                    service_no=service_no,
                    etas=etas,
                    load=load,
                    prev_interval_min=HEADWAY_SECONDS // 60,
                    bus_positions=self._positions(service_no, now),
                )
            )
        return out

    def _positions(self, service_no: str, now: float) -> list[dict]:
        ids = self.routes[service_no]
        total = HOP_SECONDS * (len(ids) - 1)
        positions = []
        k = math.floor(now / HEADWAY_SECONDS)
        while k * HEADWAY_SECONDS >= now - total:
            elapsed = now - k * HEADWAY_SECONDS
            if 0 <= elapsed <= total:
                seg = min(int(elapsed // HOP_SECONDS), len(ids) - 2)
                frac = (elapsed - seg * HOP_SECONDS) / HOP_SECONDS
                a, b = self.stops[ids[seg]], self.stops[ids[seg + 1]]
                positions.append(
                    {
                        "lat": a.lat + (b.lat - a.lat) * frac,
                        "lon": a.lon + (b.lon - a.lon) * frac,
                    }
                )
            k -= 1
        return positions
