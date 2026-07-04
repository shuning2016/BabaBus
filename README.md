# BabaBus 🚌

A Singapore bus arrival dashboard — a functional clone of SG BusLeh's core features,
built as a FastAPI + React web app. Desktop dashboard first; the JSON API is designed
to power a native mobile app later.

## Features

- Nearby bus stops via geolocation, with all arrivals in one view
- Next **3** arrival timings per service + previous-bus interval
- Live bus location map — click any timing to see the bus
- Seat capacity bars (seats / standing / crowded)
- Unified search: bus number, stop ID, road, building, postal code (via OneMap)
- Favourites with groups ("Going out" / "Coming back") and rename
- Route visualization on the map
- Browser notification when a watched bus is ≤ 3 min away
- **Bus alarms**: watch a bus at a stop during a daily time window
  (e.g. 143 at Caribbean 06:40–07:00) — live banner + notifications
- Live bus overlay on the explore map; pan anywhere to load stops
- Installable PWA (Android/desktop) with a mobile bottom-tab layout
- Server-side 15 s cache with stale-data fallback

## Run it

Backend (http://localhost:8000, docs at /docs):

    cd backend
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/uvicorn app.main:app --port 8000 --reload

Frontend (http://localhost:5173):

    cd frontend
    npm install
    npm run dev

## Demo mode vs live mode

Out of the box the app runs in **demo mode**: simulated buses moving along real
route geometry around Bugis (search "bugis" or allow the default map location).

To go live, register free at https://datamall.lta.gov.sg, then:

    cd backend
    cp .env.example .env   # paste your key into LTA_ACCOUNT_KEY
    # restart uvicorn — the header badge switches to LIVE MODE

Live mode serves stops/routes from bundled snapshots (`backend/app/data/lta_*.json`);
arrivals are always fetched live. Refresh the snapshots occasionally with
`backend/scripts/refresh_lta_snapshots.py`.

## Deploy to Vercel

The repo is Vercel-ready: `vercel.json` builds the React frontend as static files
and serves the FastAPI backend as a Python serverless function (`api/index.py`).
Just import the repo at vercel.com — no settings needed.

- To go live on Vercel, add an `LTA_ACCOUNT_KEY` environment variable in the
  Vercel project settings.
- For persistent favourites/alarms, set `TURSO_URL` and `TURSO_TOKEN`
  (Turso/libSQL). Without them, data lives in per-instance `/tmp` SQLite
  and resets between serverless invocations.

## Install on your phone

Go to **https://baba-bus.vercel.app/get.html** — a download page that shows
the right option for your device.

- **Android** — download `BabaBus.apk` and open it to install (allow
  "install unknown apps" for your browser the first time). Or just open the
  site and tap Chrome menu → "Install app".
- **iPhone / iPad** — Apple doesn't allow app-file downloads, so open the
  site in Safari → Share → **Add to Home Screen**. This installs the PWA and
  is required for alarm notifications.

### Rebuilding the Android APK

The native shell loads the live site (`server.url` in `capacitor.config.json`),
so a downloaded APK always shows the latest deployment — you rarely rebuild it.
When you do (icon/config changes), with JDK 17 + Android SDK installed:

    cd frontend
    npm run build && npx cap sync android
    cd android && ./gradlew assembleDebug
    cp app/build/outputs/apk/debug/app-debug.apk ../public/BabaBus.apk

Then commit `public/BabaBus.apk` and deploy.

### iPhone native app (Capacitor)

The repo also has a ready Xcode project at `frontend/ios/`. Building an
installable iOS app needs Xcode + an Apple ID (free works, but apps expire
after 7 days; a paid account removes that and enables TestFlight). Plain
link-download installs aren't possible on iOS — use the PWA above instead.

    cd frontend && npm run build:ios && npm run ios   # opens Xcode

## Tests

    cd backend && .venv/bin/python -m pytest tests/ -v

## Roadmap

- Train timings, EZ-Link module (pending public APIs)
- Background push notifications for bus alarms
