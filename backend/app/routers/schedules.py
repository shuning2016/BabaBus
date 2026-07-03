from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db

router = APIRouter(prefix="/api/schedules")

HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


class ScheduleIn(BaseModel):
    stop_id: str
    service_no: str
    start_time: str = Field(pattern=HHMM)  # local time, e.g. "06:40"
    end_time: str = Field(pattern=HHMM)
    label: str = ""


class ScheduleUpdate(BaseModel):
    enabled: bool | None = None
    start_time: str | None = Field(default=None, pattern=HHMM)
    end_time: str | None = Field(default=None, pattern=HHMM)
    label: str | None = None


@router.get("")
def list_all():
    return {"schedules": db.list_schedules()}


@router.post("")
def create(s: ScheduleIn):
    schedule_id = db.add_schedule(s.stop_id, s.service_no, s.start_time, s.end_time, s.label)
    return {"id": schedule_id, "enabled": True, **s.model_dump()}


@router.patch("/{schedule_id}")
def update(schedule_id: int, body: ScheduleUpdate):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(422, "Nothing to update")
    if not db.update_schedule(schedule_id, fields):
        raise HTTPException(404, "Schedule not found")
    return {"ok": True}


@router.delete("/{schedule_id}")
def remove(schedule_id: int):
    if not db.delete_schedule(schedule_id):
        raise HTTPException(404, "Schedule not found")
    return {"ok": True}
