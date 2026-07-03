import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from .base import DataSource
from .models import Route, ServiceArrival, Stop

BASE = "https://datamall2.mytransport.sg/ltaodataservice"
PAGE_SIZE = 500
SGT = timezone(timedelta(hours=8))
# Bundled catalogue snapshots (regenerate with scripts/refresh_lta_snapshots.py).
# Loading these instead of paging the full BusStops/BusRoutes tables takes a
# cold start from ~20 s to milliseconds; arrivals are always fetched live.
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class LTADataSource(DataSource):
    """Live LTA DataMall client. Static data (stops, routes) is fetched once
    per process; the first route call downloads the full BusRoutes table and
    can take ~30 s."""

    def __init__(
        self,
        account_key: str,
        client: httpx.Client | None = None,
        snapshot_dir: Path | None = DATA_DIR,
    ):
        self.client = client or httpx.Client(
            headers={"AccountKey": account_key, "accept": "application/json"},
            timeout=10,
        )
        self.snapshot_dir = snapshot_dir
        self._stops: list[Stop] | None = None
        self._routes: dict[str, list[str]] | None = None

    def _snapshot(self, name: str):
        if self.snapshot_dir is None:
            return None
        path = self.snapshot_dir / name
        return json.loads(path.read_text()) if path.exists() else None

    def _get_all(self, path: str) -> list[dict]:
        items, skip = [], 0
        while True:
            res = self.client.get(f"{BASE}/{path}", params={"$skip": skip})
            res.raise_for_status()
            batch = res.json().get("value", [])
            items.extend(batch)
            if len(batch) < PAGE_SIZE:
                return items
            skip += PAGE_SIZE

    def get_stops(self) -> list[Stop]:
        if self._stops is None:
            snap = self._snapshot("lta_stops.json")
            if snap is not None:
                self._stops = [Stop(**s) for s in snap]
            else:
                self._stops = [
                    Stop(
                        id=b["BusStopCode"],
                        name=b["Description"],
                        road=b["RoadName"],
                        lat=float(b["Latitude"]),
                        lon=float(b["Longitude"]),
                    )
                    for b in self._get_all("BusStops")
                ]
        return self._stops

    def get_arrivals(self, stop_id: str) -> list[ServiceArrival]:
        res = self.client.get(f"{BASE}/v3/BusArrival", params={"BusStopCode": stop_id})
        res.raise_for_status()
        now = datetime.now(timezone.utc)
        out = []
        for svc in res.json().get("Services", []):
            etas, positions = [], []
            for key in ("NextBus", "NextBus2", "NextBus3"):
                bus = svc.get(key) or {}
                if not bus.get("EstimatedArrival"):
                    continue
                eta = datetime.fromisoformat(bus["EstimatedArrival"])
                if eta.tzinfo is None:
                    eta = eta.replace(tzinfo=SGT)
                etas.append(max(0, round((eta - now).total_seconds() / 60)))
                lat, lon = float(bus.get("Latitude") or 0), float(bus.get("Longitude") or 0)
                if lat and lon:
                    positions.append({"lat": lat, "lon": lon})
            load = (svc.get("NextBus") or {}).get("Load") or "SEA"
            prev = etas[1] - etas[0] if len(etas) >= 2 else 0
            out.append(ServiceArrival(svc["ServiceNo"], etas, load, prev, positions))
        return out

    def _route_map(self) -> dict[str, list[str]]:
        if self._routes is None:
            snap = self._snapshot("lta_routes.json")
            if snap is not None:
                self._routes = snap
                return self._routes
            grouped: dict[str, list[tuple[int, str]]] = {}
            for r in self._get_all("BusRoutes"):
                if r["Direction"] == 1:
                    grouped.setdefault(r["ServiceNo"], []).append(
                        (r["StopSequence"], r["BusStopCode"])
                    )
            self._routes = {
                no: [code for _, code in sorted(pairs)] for no, pairs in grouped.items()
            }
        return self._routes

    def get_service_nos(self) -> list[str]:
        return sorted(self._route_map().keys())

    def get_route(self, service_no: str) -> Route | None:
        ids = self._route_map().get(service_no)
        if not ids:
            return None
        by_id = {s.id: s for s in self.get_stops()}
        stops = [by_id[i] for i in ids if i in by_id]
        return Route(service_no, stops, [[s.lat, s.lon] for s in stops])
