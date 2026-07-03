from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from pywebpush import WebPushException

from .. import db
from ..alarms import within_window
from ..config import settings
from ..deps import get_datasource
from ..push import send_web_push

SGT = timezone(timedelta(hours=8))
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


def _broadcast(payload: dict) -> int:
    sent = 0
    for s in db.list_subscriptions():
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
    now_epoch = int(now.timestamp())

    subs = db.list_subscriptions()
    if not subs:
        return {"now": now.strftime("%H:%M"), "subscribers": 0, "pushed": []}

    ds = get_datasource()
    pushed = []
    for s in db.list_schedules():
        if not s["enabled"] or not within_window(now_min, s["start_time"], s["end_time"]):
            continue
        every = s.get("remind_every") or 4
        last = s.get("last_push")
        if last is not None and now_epoch - last < every * 60 - 20:
            continue

        try:
            arrivals = ds.get_arrivals(s["stop_id"])
        except Exception:
            arrivals = []
        svc = next((a for a in arrivals if a.service_no == s["service_no"]), None)
        etas = svc.etas if svc else []
        if etas:
            lead = "arriving now" if etas[0] <= 0 else f"{etas[0]} min"
            rest = f" · then {', '.join(f'{e}m' for e in etas[1:])}" if len(etas) > 1 else ""
            body = f"{s['label']}: {lead}{rest}"
        else:
            body = f"{s['label']}: no live timing right now"

        _broadcast({"title": f"🚌 Bus {s['service_no']}", "body": body, "tag": f"alarm-{s['id']}"})
        db.set_last_push(s["id"], now_epoch)
        pushed.append({"id": s["id"], "body": body})

    return {"now": now.strftime("%H:%M"), "subscribers": len(subs), "pushed": pushed}
