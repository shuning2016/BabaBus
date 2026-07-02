# BabaBus v1 — Design Spec

**Date:** 2026-07-02
**Status:** Approved by user
**Goal:** Duplicate the core functions of SG BusLeh (Singapore public bus arrival app) as a desktop web dashboard, architected so the same backend later serves a native mobile app.

## Background

SG BusLeh (by Originally US) is an award-winning Singapore bus arrival app built on LTA
DataMall real-time data. Its core functions, all in scope for v1:

1. **Nearby bus stops** — geolocate the user on load; list nearest stops with all arrivals visible.
2. **Real-time arrivals** — next **3** ETAs per bus service (not the usual 2), plus the interval
   between the previous and next bus (crowding predictor).
3. **Live bus location map** — click an arrival timing to see that bus's current position on a map.
4. **Seat capacity bars** — occupancy of each incoming bus (seats available / standing / limited)
   as simple visual bars.
5. **Unified search** — one box accepting bus numbers, bus-stop IDs, road names, building names,
   and postal codes.
6. **Favourites with groups** — save stops, rename them, group them ("Going out" / "Coming back").
7. **Route visualization** — click a service number to see its full stop list and route line.
8. **Arrival notifications** — watch a bus; get a browser notification when its ETA drops below a
   threshold.
9. **Speed layer** — server-side caching of upstream timings so the UI never lags (BusLeh caches
   LTA data in server RAM).

**Out of scope for v1 (future modules):** EZ-Link balance (no public API), train timings (no
public real-time feed), NTU/NUS shuttles, native mobile app, user accounts.

## Architecture (Approach C — FastAPI + React, user-selected)

```
BabaBus/
├── backend/                      FastAPI, Python 3.11+, uvicorn
│   ├── app/
│   │   ├── main.py               app entry, CORS (dev), router mounting
│   │   ├── config.py             settings from .env (LTA_ACCOUNT_KEY, etc.)
│   │   ├── cache.py              in-memory TTL cache (arrivals ~15 s TTL)
│   │   ├── db.py                 SQLite (favourites)
│   │   ├── datasource/
│   │   │   ├── base.py           DataSource abstract interface
│   │   │   ├── lta.py            live LTA DataMall client (httpx)
│   │   │   └── demo.py           simulator over bundled real SG stop/route data
│   │   ├── data/                 bundled snapshot: bus stops, services, routes (JSON)
│   │   └── routers/
│   │       ├── stops.py          nearby + arrivals
│   │       ├── search.py         unified search
│   │       ├── services.py       route visualization
│   │       └── favourites.py     CRUD with groups
│   ├── tests/                    pytest
│   └── requirements.txt
├── frontend/                     React 18 + Vite, react-leaflet, Roboto/Shopee palette
│   └── src/
│       ├── App.jsx               layout: navy sidebar (favourites), main panel, map pane
│       ├── api.js                fetch wrapper for /api
│       └── components/           StopCard, ArrivalRow, CapacityBar, BusMap,
│                                 SearchBar, FavouritesPanel, RouteView, WatchButton
├── .env.example                  LTA_ACCOUNT_KEY=   (empty = demo mode)
└── docs/superpowers/specs/       this document
```

### The datasource seam

`DataSource` is the single interface both modes implement:

- `get_stops()` / `get_stops_near(lat, lon, radius)`
- `get_arrivals(stop_id)` → per service: `[eta1, eta2, eta3]`, `load` (SEA/SDA/LSD like LTA),
  `bus_positions`, `prev_interval_minutes`
- `get_route(service_no)` → ordered stops + polyline coordinates
- `search(q)` → stops and services matching bus no / stop id / road / building / postal code

Mode selection at startup: if `LTA_ACCOUNT_KEY` is set in `.env`, use `lta.py`; otherwise
`demo.py`. **No code changes needed to go live.**

The demo simulator uses the bundled snapshot of real Singapore stops and routes and moves
virtual buses along actual route geometry on a clock, so ETAs, positions, and capacity values
behave realistically and refresh coherently.

### Caching (speed layer)

`cache.py` wraps datasource calls with per-key TTLs: arrivals ~15 s, bus positions ~15 s,
static data (stops/routes) cached until restart. On upstream failure, serve the last cached
value with a `stale: true` flag that the UI surfaces as a subtle indicator.

## API (consumed by the dashboard now, the mobile app later)

| Endpoint | Returns |
|---|---|
| `GET /api/stops/nearby?lat=&lon=&radius=` | nearest stops with distance |
| `GET /api/stops/{stop_id}/arrivals` | per service: 3 ETAs, capacity level, prev-bus interval, live bus coords, stale flag |
| `GET /api/search?q=` | matched stops + services (unified) |
| `GET /api/services/{service_no}/route` | ordered stop list + polyline |
| `GET /api/favourites` / `POST` / `DELETE /api/favourites/{id}` | favourites with `group` and `custom_name` |

Interactive docs at `/docs` (FastAPI built-in) — primary debugging surface.

## Frontend screens

- **Home**: browser geolocation on load (fallback: Singapore CBD center + search); nearby stop
  cards, each expandable to show every service with 3 ETAs and capacity bars.
- **Live bus map**: clicking an ETA opens a Leaflet map pane centered on that bus's position,
  polling every ~15 s.
- **Unified search bar** pinned at top.
- **Favourites sidebar** (navy): grouped "Going out" / "Coming back", rename inline,
  add via star icon on any stop card.
- **Route view**: clicking a service number shows the stop sequence and route polyline on the map.
- **Watch**: a bell icon per service; when watched, the frontend polls and fires a browser
  Notification when ETA ≤ 3 min (threshold adjustable in the UI).

**Branding:** per the user's global rules, UI follows Shopee brand guidelines — Shopee Orange
`#EE4D2D` primary, Navy `#172B4D` sidebar, Bright Blue `#0080C6` interactive states, Yellow
`#FCCD34` badges, Roboto via Google Fonts. The shopee-brand-guidelines skill must be invoked
before frontend code is written.

## Error handling

- Upstream (LTA) error/timeout → cached stale data + UI indicator; never a blank screen.
- Geolocation denied → default center, message prompting search.
- Unknown stop/service → 404 with clear message; UI shows friendly empty state.
- Demo mode is clearly labeled in the UI footer so live vs demo is never ambiguous.

## Testing

- `pytest` for: datasource interface conformance (demo adapter), cache TTL/stale behavior,
  each router (via FastAPI TestClient), unified search matching rules.
- Frontend verified interactively (dashboard is the debugging surface by design);
  component tests optional in v1.

## Milestones

1. Backend skeleton + demo datasource + tests green
2. API routers complete, verified via `/docs`
3. React dashboard: home + search + arrivals
4. Map, route view, favourites, watch/notifications
5. LTA live adapter (activates when user provides key)
