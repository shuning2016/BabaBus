import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from pywebpush import WebPushException

from .. import db
from ..alarms import active_on, monitored_services, within_window
from ..config import settings
from ..datasource.base import haversine_m
from ..deps import get_datasource, get_owner
from ..push import send_web_push

SGT = timezone(timedelta(hours=8))
# iOS shows a banner on every web push (no silent refresh), so re-alert Apple
# subscriptions no more often than this many minutes; Android refreshes each tick.
APPLE_MIN_MINUTES = 5
# Walk-to-the-stop estimate for the "which bus can I catch" hint: adult average
# speed over straight-line distance × a detour factor (streets aren't straight).
WALK_MPS = 1.33
WALK_DETOUR = 1.25
CATCH_BUFFER_MIN = 1  # need this much slack on top of the walk to board safely
LOCATION_FRESH_S = 15 * 60  # ignore location fixes older than this
router = APIRouter(prefix="/api/push")


class SubIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class UnsubIn(BaseModel):
    endpoint: str


@router.get("/vapid")
def vapid_key():
    return {"public_key": settings.vapid_public_key}


@router.post("/subscribe")
def subscribe(sub: SubIn, owner: str = Depends(get_owner)):
    db.add_subscription(sub.endpoint, sub.p256dh, sub.auth, owner=owner)
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(sub: UnsubIn, owner: str = Depends(get_owner)):
    db.delete_subscription(sub.endpoint)
    return {"ok": True}


def _broadcast(payload: dict, subs: list | None = None) -> int:
    sent = 0
    for s in (subs if subs is not None else db.list_subscriptions()):
        try:
            send_web_push(s, payload)
            sent += 1
        except WebPushException as e:
            code = getattr(e.response, "status_code", None)
            if code in (404, 410):  # subscription gone — forget it
                db.delete_subscription(s["endpoint"])
        except Exception:
            pass  # transient send failure — keep the sub, retry next tick
    return sent


def _catch_hint(loc: dict | None, stop, rows, now_epoch: int) -> str | None:
    """From the user's last known location, how long is the walk to the stop
    and which shown bus can they still catch if they leave right now?"""
    if not loc or not stop or not rows:
        return None
    if now_epoch - loc["updated"] > LOCATION_FRESH_S:
        return None
    walk_m = haversine_m(loc["lat"], loc["lon"], stop.lat, stop.lon) * WALK_DETOUR
    walk_min = max(1, math.ceil(walk_m / WALK_MPS / 60))
    best = None  # (eta, service_no) of the earliest catchable bus
    for a in rows:
        for eta in a.etas:
            if eta >= walk_min + CATCH_BUFFER_MIN and (best is None or eta < best[0]):
                best = (eta, a.service_no)
    if best:
        return f"🚶{walk_min} min → 🏃 catch {best[1]} in {best[0]} min"
    return f"🚶{walk_min} min walk — shown buses leave too soon"


def _is_apple(endpoint: str) -> bool:
    """Apple/iOS web push must show a banner on every push (no silent update),
    so we re-alert Apple subscriptions on a gentler cadence than Android."""
    return endpoint.startswith("https://web.push.apple.com")


def _guard(secret: str):
    if not settings.push_secret or secret != settings.push_secret:
        raise HTTPException(403, "bad secret")


@router.post("/test")
def test_push(secret: str = Query(""), x_device_id: str | None = Header(default=None)):
    _guard(secret)
    # Scope to the calling device when it sends its id; otherwise notify everyone.
    subs = db.list_subscriptions(x_device_id) if x_device_id else None
    return {"sent": _broadcast({"title": "🚌 BabaBus", "body": "Push notifications are working!"}, subs)}


@router.post("/tick")
def tick(secret: str = Query("")):
    """Called every minute by cron. For each enabled alarm whose window is
    active and whose remind_every interval has elapsed, push the next-bus
    timing to every subscription."""
    _guard(secret)
    now = datetime.now(SGT)
    now_min = now.hour * 60 + now.minute
    weekday = now.weekday()  # Mon=0 … Sun=6
    now_epoch = int(now.timestamp())

    all_subs = db.list_subscriptions()
    if not all_subs:
        return {"now": now.strftime("%H:%M"), "subscribers": 0, "pushed": []}
    # Each alarm is only pushed to its own device's subscriptions.
    subs_by_owner: dict = {}
    for sub in all_subs:
        subs_by_owner.setdefault(sub.get("owner"), []).append(sub)

    ds = get_datasource()
    stops_by_id = None  # built lazily — only when a fresh location needs the hint
    loc_by_owner: dict = {}
    pushed = []
    for s in db.list_schedules():
        if not s["enabled"] or not within_window(now_min, s["start_time"], s["end_time"]):
            continue
        if not active_on(s.get("days") or "1111111", weekday):
            continue
        every = s.get("remind_every") or 1
        last = s.get("last_push")
        if last is not None and now_epoch - last < every * 60 - 20:
            continue
        owner_subs = subs_by_owner.get(s.get("owner"), [])
        if not owner_subs:
            continue  # this device has no push subscription to notify

        try:
            arrivals = ds.get_arrivals(s["stop_id"])
        except Exception:
            arrivals = []
        watch = monitored_services(s)  # [] = every bus at the stop
        rows = [a for a in arrivals if not watch or a.service_no in watch]
        rows = [a for a in rows if a.etas]
        rows.sort(key=lambda a: a.etas[0])
        if rows:
            parts = [
                f"{a.service_no}: {'now' if a.etas[0] <= 0 else str(a.etas[0]) + ' min'}"
                for a in rows[:3]
            ]
            body = " · ".join(parts)
            # With a fresh location fix, add walk time and which bus is catchable.
            owner = s.get("owner")
            if owner not in loc_by_owner:
                loc_by_owner[owner] = db.get_location(owner) if owner else None
            if loc_by_owner[owner]:
                if stops_by_id is None:
                    stops_by_id = {st.id: st for st in ds.get_stops()}
                hint = _catch_hint(loc_by_owner[owner], stops_by_id.get(s["stop_id"]), rows, now_epoch)
                if hint:
                    body = f"{body} · {hint}"
        else:
            body = "no live timing right now"

        # iOS banners on every push (no silent update), so re-alert Apple subs on
        # a gentler cadence — at least every APPLE_MIN_MINUTES minutes — while
        # Android refreshes the same notification silently each tick. Only alert
        # once there's real timing worth showing.
        apple_seen = s.get("last_apple_push")
        apple_gap = max(every, APPLE_MIN_MINUTES) * 60 - 20
        apple_due = bool(rows) and (apple_seen is None or now_epoch - apple_seen >= apple_gap)
        targets = [x for x in owner_subs if apple_due or not _is_apple(x["endpoint"])]
        if not targets:
            continue

        title = s["label"] or f"🚌 {s['stop_id']}"
        _broadcast({"title": title, "body": body, "tag": f"alarm-{s['id']}"}, targets)
        db.set_last_push(s["id"], now_epoch)
        if apple_due:
            db.set_last_apple_push(s["id"], now_epoch)
        pushed.append({"id": s["id"], "body": body})

    return {"now": now.strftime("%H:%M"), "subscribers": len(all_subs), "pushed": pushed}
