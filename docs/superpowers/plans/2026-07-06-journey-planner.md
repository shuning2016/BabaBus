# BabaBus Journey Planner ("Go") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Go" module: the user picks a destination (and optionally a start point — default = current GPS location); BabaBus finds the nearest useful bus stops, works out **which bus they can actually catch** (adult walking speed vs live ETAs), and shows door-to-door itineraries with walk → wait → ride → walk breakdown and total trip time.

**Architecture:** A pure-Python journey core (`backend/app/journey.py`) over an upgraded route snapshot that stores **both directions** and LTA's per-stop **route distance (km)**. A new `GET /api/journey` endpoint scores direct-bus itineraries between the N nearest origin stops and N nearest destination stops, refining ride/wait times with live arrivals. The frontend adds a 5th bottom tab **Go 🧭** with start/destination inputs (OneMap geocoding via the existing `/api/search`), result cards, and map hand-off.

**Tech stack:** unchanged (FastAPI + snapshot JSON + httpx; React + Leaflet). No new dependencies.

## Global constraints

- All timings in **minutes, rounded up** for display; internal math in seconds.
- **Walking:** adult average speed `WALK_MPS = 1.33` (≈ 4.8 km/h), applied to haversine distance × `WALK_DETOUR = 1.25` (streets aren't straight lines).
- **Bus ride estimate (fallback):** route-distance delta at `BUS_KMH = 19` (SG average commercial speed incl. stops) + `DWELL_S = 20` per intermediate stop. In demo mode the simulator's `HOP_SECONDS = 120` per hop is the ride time (keeps tests deterministic).
- **Bus ride estimate (live refinement):** when live data is available, prefer `ETA_dest − ETA_origin` for the *same* service — the k-th arrival slot at both stops approximates the same physical bus; use it when both ETAs exist and the delta is positive, else fall back to the distance model.
- **Catchability:** a bus with origin-stop ETA `e` is catchable iff `walk_time_to_stop + CATCH_BUFFER_S (60) ≤ e`. The itinerary's wait = `e − walk_time`. If none of the 3 ETAs is catchable, mark the leg `"catchable": false` and estimate with the last ETA + typical headway note.
- Candidate stops: up to **5** origin stops and **5** destination stops within **800 m** (reuse `get_stops_near`).
- Scope: **direct (no-transfer) routes only** in this plan; a 1-transfer engine is listed as an explicit follow-up (Task 8, optional).
- Keep the old `lta_routes.json` shape working until the loader migration lands (Task 1 ships both).
- Shopee brand rules apply to all new UI; every commit `<type>: <description>` with the session's standard trailers; never `git add -A`.
- Backend tests from `backend/`: `python3 -m pytest tests/ -v`. Frontend must `npm run build` clean.

---

### Task 1: Route snapshot v2 — both directions + distances

**Files:**
- Modify: `backend/scripts/refresh_lta_snapshots.py`, `backend/app/datasource/lta.py`
- Modify: `backend/app/datasource/demo.py` (expose the same richer shape)
- Test: `backend/tests/test_lta.py` (extend), `backend/tests/test_demo.py` (extend)

**Interfaces:**
- New snapshot `lta_routes.json` value shape: `{service: {"1": [{"s": stop_code, "d": km_from_origin}, …], "2": […]}}` (direction key → ordered stop+distance list). Old shape (`{service: [codes]}`) still loads via a compat branch.
- New `DataSource.get_route_directions(service_no) -> dict[str, list[tuple[str, float]]]` returning `{direction: [(stop_id, dist_km), …]}`; default implementation derives it from `get_route()` with `dist_km` cumulated by haversine so **demo mode works without new data**.

**Steps:**
- [ ] Extend `LTADataSource._route_map` to group BusRoutes rows by `(ServiceNo, Direction)` keeping `(StopSequence, BusStopCode, Distance)`; build the v2 dict; keep `get_route`/`get_service_nos` reading direction "1" so existing behaviour is untouched.
- [ ] Compat loader: if the snapshot value is a plain list (old shape), wrap it as `{"1": [{"s": code, "d": None}, …]}`.
- [ ] Update the refresh script to write the v2 shape; regenerate the bundled snapshot (needs `LTA_ACCOUNT_KEY`; if unavailable in the work session, keep the old snapshot — compat loader covers it, and note it in the PR).
- [ ] Demo datasource: implement `get_route_directions` returning direction "1" with cumulative haversine distances (matches its `get_route`).
- [ ] Tests: v2 parse, old-shape compat, demo distances monotonically increasing.

### Task 2: Journey core — pure functions

**Files:**
- Create: `backend/app/journey.py`
- Test: `backend/tests/test_journey.py`

**Interfaces (all pure, no I/O — mirror the style of `alarms.py`):**
- `walk_seconds(dist_m: float) -> int` — detour factor + WALK_MPS.
- `ride_seconds_distance(dist_km: float, n_stops: int) -> int` — BUS_KMH + dwell.
- `segment(direction_stops, from_id, to_id) -> Optional[dict]` — locate `from` **before** `to` in one direction's ordered list; return `{n_stops, dist_km|None}`; handles loop services (first index match wins) and missing distance.
- `pick_catchable(etas_s: list[int], walk_s: int) -> dict` — first catchable ETA per CATCH_BUFFER_S, `{catchable, wait_s, eta_s}`.
- `score(itin) -> int` — total seconds (walk1 + wait + ride + walk2); tie-break fewer stops.

**Steps:**
- [ ] Implement with module constants (`WALK_MPS`, `WALK_DETOUR`, `BUS_KMH`, `DWELL_S`, `CATCH_BUFFER_S`).
- [ ] Table-driven tests: walk time (800 m ≈ 12–13 min), segment found/not-found/wrong-order/loop, catchable picks 2nd ETA when 1st is too soon, none catchable, scoring order.

### Task 3: `GET /api/journey` endpoint (direct routes)

**Files:**
- Create: `backend/app/routers/journey.py`; register in `backend/app/main.py`
- Test: `backend/tests/test_journey_api.py` (demo mode — deterministic)

**Interfaces:**
- `GET /api/journey?from_lat&from_lon&to_lat&to_lon&limit=3` →
  ```json
  {"itineraries": [{
     "service_no": "131",
     "board": {"stop_id":…, "stop_name":…, "walk_m": …, "walk_min": …},
     "alight": {"stop_id": …, "stop_name": …, "walk_m": …, "walk_min": …},
     "bus": {"catchable": true, "eta_min": 4, "wait_min": 2, "next_etas": [4, 12, 21]},
     "ride": {"stops": 9, "min": 17, "source": "live"|"model"},
     "total_min": 31
  }, …], "from": {...}, "to": {...}}
  ```
- 422 on missing/invalid coords; empty `itineraries` (not an error) when nothing within 800 m or no direct service.

**Steps:**
- [ ] Gather 5×5 candidate stop pairs; for each service serving an origin candidate, test `segment()` against each destination candidate in both directions; dedupe to the best (lowest score) per service.
- [ ] Fetch live arrivals **only** for the boarding stops of surviving candidates (≤5 calls, reuse the arrivals TTL cache) → `pick_catchable`; try the live `ETA_dest − ETA_origin` refinement, else distance model (demo: hops × `HOP_SECONDS`).
- [ ] Sort by `score`, return top `limit`.
- [ ] Tests (demo sim): known Bugis-area pair returns an itinerary with the expected service; total = walk+wait+ride+walk; unreachable coords → empty list; bad params → 422.

### Task 4: Frontend API + "Go" tab shell

**Files:**
- Modify: `frontend/src/api.js` (`planJourney(from, to)`), `frontend/src/App.jsx` (5th tab `go` 🧭 "Go", pane wiring)
- Create: `frontend/src/components/JourneyPanel.jsx`
- Modify: `frontend/src/theme.css`

**Steps:**
- [ ] Tab bar gains **Go** (keep 5 tabs comfortable on 390 px — icons 21 px already fit).
- [ ] `JourneyPanel`: two inputs — **From** (default chip "📍 Current location", tap to type) and **To**; both use a shared `PlaceInput` that debounces `/api/search` and lists stops + geocoded OneMap hits; selecting fills `{lat, lon, label}`.
- [ ] "Find buses" button → `planJourney`; loading / empty / error states ("No direct bus found — try a nearer destination" when `itineraries` is empty).
- [ ] Re-resolve "Current location" GPS on every plan tap (don't reuse a stale fix).

### Task 5: Itinerary result cards

**Files:**
- Modify: `frontend/src/components/JourneyPanel.jsx`, `frontend/src/theme.css`

**Steps:**
- [ ] Card per itinerary: big service chip + total time; timeline rows `🚶 4 min → Opp St. Theresa's Convent`, `🚌 Bus 131 in 6 min (catch it ✅ / tight ⏱)`, `🚏 9 stops · 17 min ride`, `🚶 3 min → destination`.
- [ ] `catchable: false` renders an amber "you'll likely miss the shown buses — next ones unknown" note instead of a green catch badge.
- [ ] Buttons per card: **⏰ Alarm this stop** (prefilled `onCreateStationAlarm` with the boarding stop + service, window now→+30 min) and **🗺 Map** (jump to Map tab centred on the boarding stop with the service route drawn — reuse `onShowRoute`/`showOnMap`).
- [ ] Poll: while the Go pane is visible and results exist, refresh the plan every 20 s so ETAs/catchability stay live (reuse the app's resume-refresh pattern).

### Task 6: Map hand-off polish

**Files:**
- Modify: `frontend/src/App.jsx`, `frontend/src/components/BusMap.jsx`

**Steps:**
- [ ] `showOnMap({type:'journey', …})`: draw boarding→alighting sub-polyline of the route (slice the route stops between board/alight), origin/destination teardrop pins, boarding stop highlighted.
- [ ] Back-link "✕ back to journey" returns to the Go tab with results intact (state lives in App, not the pane).

### Task 7: Verification & docs

**Steps:**
- [ ] `python3 -m pytest tests/ -v` green; `npm run build` clean; screenshot the Go tab (390 px) via the repo's Playwright harness and eyeball card layout vs the bottom nav spacer.
- [ ] README: add a "Journey planner" section (constants table: walk speed, detour, bus speed, dwell, catch buffer) so the "adult average speed" assumptions are documented and tweakable.
- [ ] Manual live check on deploy: Caribbean at Keppel Bay → Bugis returns 131/143-family options with sane times.

### Task 8 (optional, follow-up PR): one-transfer itineraries

- [ ] Precompute `stop → services` index; for origin/destination candidate sets with no direct hit (or to beat the best direct score), try `serviceA(board→X) + walk(X→Y ≤ 250 m or X == Y) + serviceB(Y→alight)`; cap search via the 5×5 candidates and services-per-stop fan-out; transfer penalty 5 min in `score`.
- [ ] Only surface a transfer itinerary when it beats the best direct option by ≥ 8 min or no direct exists.

## Honest accuracy notes (bake into UI copy)

- Ride times are **estimates** (distance model) unless the live ETA-delta refinement kicks in (`ride.source` tells the UI which — show "~" prefix for `model`).
- LTA arrivals only expose the next **3 buses (~30–45 min horizon)**; beyond that, catchability is unknowable — the UI must say so rather than fake precision.
- Walking uses straight-line × 1.25; hilly/blocked paths can be slower. Constants live in one place (`journey.py`) for tuning.
