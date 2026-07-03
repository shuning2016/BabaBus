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

Note: in live mode the first route lookup downloads LTA's full route table (~30 s), then it's cached in memory.

## Deploy to Vercel

The repo is Vercel-ready: `vercel.json` builds the React frontend as static files
and serves the FastAPI backend as a Python serverless function (`api/index.py`).
Just import the repo at vercel.com — no settings needed.

- To go live on Vercel, add an `LTA_ACCOUNT_KEY` environment variable in the
  Vercel project settings.
- Favourites use SQLite at `/tmp` on Vercel, so they reset between serverless
  invocations — fine for playing around; a hosted DB (e.g. Turso) is the
  future fix.
- In live mode, route lookups can exceed the serverless time budget on the
  first call (LTA's full route table download); demo mode is unaffected.

## Tests

    cd backend && .venv/bin/python -m pytest tests/ -v

## Roadmap

- Train timings, EZ-Link module (pending public APIs)
- Native mobile app consuming this same API
