from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..alarms import monitored_services

router = APIRouter(prefix="/api/schedules")

HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"
DAYS = r"^[01]{7}$"  # Mon..Sun mask


def shape(row: dict) -> dict:
    return {**row, "services": monitored_services(row)}


class ScheduleIn(BaseModel):
    stop_id: str
    services: list[str] = []  # buses to watch; [] = all buses at the stop
    start_time: str = Field(pattern=HHMM)  # local time, e.g. "06:40"
    end_time: str = Field(pattern=HHMM)
    label: str = ""
    remind_every: int = Field(default=1, ge=1, le=60)  # push cadence, minutes
    days: str = Field(default="1111111", pattern=DAYS)


class ScheduleUpdate(BaseModel):
    enabled: bool | None = None
    services: list[str] | None = None
    start_time: str | None = Field(default=None, pattern=HHMM)
    end_time: str | None = Field(default=None, pattern=HHMM)
    label: str | None = None
    remind_every: int | None = Field(default=None, ge=1, le=60)
    days: str | None = Field(default=None, pattern=DAYS)


@router.get("")
def list_all():
    return {"schedules": [shape(r) for r in db.list_schedules()]}


@router.post("")
def create(s: ScheduleIn):
    csv = ",".join(s.services)
    schedule_id = db.add_schedule(
        s.stop_id, csv, s.start_time, s.end_time, s.label, s.remind_every, s.days
    )
    return {"id": schedule_id, "enabled": True, **s.model_dump()}


@router.patch("/{schedule_id}")
def update(schedule_id: int, body: ScheduleUpdate):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(422, "Nothing to update")
    if "services" in fields:  # store list as CSV; keep legacy service_no in sync
        services = fields.pop("services")
        fields["services"] = ",".join(services)
        fields["service_no"] = services[0] if services else ""
    if not db.update_schedule(schedule_id, fields):
        raise HTTPException(404, "Schedule not found")
    return {"ok": True}


@router.delete("/{schedule_id}")
def remove(schedule_id: int):
    if not db.delete_schedule(schedule_id):
        raise HTTPException(404, "Schedule not found")
    return {"ok": True}
