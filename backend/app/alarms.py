"""Pure alarm-window helpers, mirrored on the frontend (alarmClock.js)."""


def to_minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def within_window(now_min: int, start: str, end: str) -> bool:
    """True when now_min is in [start, end); supports windows crossing midnight."""
    s, e = to_minutes(start), to_minutes(end)
    if s <= e:
        return s <= now_min < e
    return now_min >= s or now_min < e


def active_on(days: str, weekday: int) -> bool:
    """days is a 7-char mask, index 0=Monday … 6=Sunday (Python weekday())."""
    return len(days) == 7 and days[weekday] == "1"


def monitored_services(row: dict) -> list[str]:
    """Buses an alarm watches. Empty list means every bus at the stop."""
    csv = row.get("services") or row.get("service_no") or ""
    return [s for s in csv.split(",") if s]
