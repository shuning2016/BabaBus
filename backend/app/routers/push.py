from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from pywebpush import WebPushException

from .. import db
from ..alarms import active_on, monitored_services, within_window
from ..config import settings
from ..deps import get_datasource
from ..push import send_web_push

SGT = timezone(timedelta(hours=8))
# iOS shows a banner on every web push (no silent refresh), so re-alert Apple
# subscriptions no more often than this many minutes; Android refreshes each tick.
APPLE_MIN_MINUTES = 5
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
def subscribe(sub: SubIn):
    db.add_subscription(sub.endpoint, sub.p256dh, sub.auth)
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(sub: UnsubIn):
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


def _is_apple(endpoint: str) -> bool:
    """Apple/iOS web push must show a banner on every push (no silent update),
    so we re-alert Apple subscriptions on a gentler cadence than Android."""
    return endpoint.startswith("https://web.push.apple.com")


def _guard(secret: str):
    if not settings.push_secret or secret != settings.push_secret:
        raise HTTPException(403, "bad secret")


@router.post("/test")
def test_push(secret: str = Query("")):
    _guard(secret)
    return {"sent": _broadcast({"title": "🚌 BabaBus", "body": "Push notifications are working!"})}


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

    subs = db.list_subscriptions()
    if not subs:
        return {"now": now.strftime("%H:%M"), "subscribers": 0, "pushed": []}

    ds = get_datasource()
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
        else:
            body = "no live timing right now"

        # iOS banners on every push (no silent update), so re-alert Apple subs on
        # a gentler cadence — at least every APPLE_MIN_MINUTES minutes — while
        # Android refreshes the same notification silently each tick. Only alert
        # once there's real timing worth showing.
        apple_seen = s.get("last_apple_push")
        apple_gap = max(every, APPLE_MIN_MINUTES) * 60 - 20
        apple_due = bool(rows) and (apple_seen is None or now_epoch - apple_seen >= apple_gap)
        targets = [x for x in subs if apple_due or not _is_apple(x["endpoint"])]
        if not targets:
            continue

        title = s["label"] or f"🚌 {s['stop_id']}"
        _broadcast({"title": title, "body": body, "tag": f"alarm-{s['id']}"}, targets)
        db.set_last_push(s["id"], now_epoch)
        if apple_due:
            db.set_last_apple_push(s["id"], now_epoch)
        pushed.append({"id": s["id"], "body": body})

    return {"now": now.strftime("%H:%M"), "subscribers": len(subs), "pushed": pushed}
