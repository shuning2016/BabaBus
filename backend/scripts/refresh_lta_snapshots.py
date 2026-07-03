"""Regenerate the bundled LTA catalogue snapshots (stops + routes).

Run from backend/ with a valid key in .env whenever LTA changes stops/routes
(a few times a year is plenty):  .venv/bin/python scripts/refresh_lta_snapshots.py
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.datasource.lta import DATA_DIR, LTADataSource  # noqa: E402


def main() -> None:
    if settings.demo_mode:
        raise SystemExit("LTA_ACCOUNT_KEY missing in backend/.env — cannot refresh")
    t0 = time.time()
    src = LTADataSource(settings.lta_account_key, snapshot_dir=None)  # force API download
    stops = src.get_stops()
    routes = src._route_map()
    DATA_DIR.joinpath("lta_stops.json").write_text(json.dumps(
        [{"id": s.id, "name": s.name, "road": s.road, "lat": s.lat, "lon": s.lon} for s in stops],
        separators=(",", ":")))
    DATA_DIR.joinpath("lta_routes.json").write_text(json.dumps(routes, separators=(",", ":")))
    print(f"{len(stops)} stops, {len(routes)} services in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
