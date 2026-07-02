import math
from abc import ABC, abstractmethod
from typing import Optional

from .models import Route, ServiceArrival, Stop


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class DataSource(ABC):
    @abstractmethod
    def get_stops(self) -> list[Stop]: ...

    @abstractmethod
    def get_arrivals(self, stop_id: str) -> list[ServiceArrival]: ...

    @abstractmethod
    def get_route(self, service_no: str) -> Optional[Route]: ...

    @abstractmethod
    def get_service_nos(self) -> list[str]: ...

    def get_stops_near(
        self, lat: float, lon: float, radius_m: float = 500.0, limit: int = 8
    ) -> list[tuple[Stop, float]]:
        pairs = [(s, haversine_m(lat, lon, s.lat, s.lon)) for s in self.get_stops()]
        pairs = [p for p in pairs if p[1] <= radius_m]
        pairs.sort(key=lambda p: p[1])
        return pairs[:limit]
