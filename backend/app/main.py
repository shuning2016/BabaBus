from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from . import db
from .routers import favourites, push, schedules, search, services, stops

app = FastAPI(title="BabaBus API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db.init_db()
app.include_router(stops.router)
app.include_router(search.router)
app.include_router(services.router)
app.include_router(favourites.router)
app.include_router(schedules.router)
app.include_router(push.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "demo" if settings.demo_mode else "live"}
