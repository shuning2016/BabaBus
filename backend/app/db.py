import contextlib
import sqlite3
from typing import Optional

from .config import settings


def _conn(path: Optional[str] = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or settings.db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(path: Optional[str] = None) -> None:
    with contextlib.closing(_conn(path)) as c, c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS favourites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stop_id TEXT NOT NULL,
                custom_name TEXT NOT NULL,
                group_name TEXT NOT NULL DEFAULT 'Going out',
                service_no TEXT
            )"""
        )
        try:  # migrate pre-existing databases created before service_no
            c.execute("ALTER TABLE favourites ADD COLUMN service_no TEXT")
        except sqlite3.OperationalError:
            pass
        c.execute(
            """CREATE TABLE IF NOT EXISTS schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stop_id TEXT NOT NULL,
                service_no TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                label TEXT NOT NULL DEFAULT '',
                enabled INTEGER NOT NULL DEFAULT 1
            )"""
        )


def list_favourites(path: Optional[str] = None) -> list[dict]:
    with contextlib.closing(_conn(path)) as c, c:
        rows = c.execute("SELECT * FROM favourites ORDER BY group_name, id").fetchall()
        return [dict(r) for r in rows]


def add_favourite(
    stop_id: str,
    custom_name: str,
    group_name: str,
    service_no: Optional[str] = None,
    path: Optional[str] = None,
) -> int:
    with contextlib.closing(_conn(path)) as c, c:
        cur = c.execute(
            "INSERT INTO favourites (stop_id, custom_name, group_name, service_no) VALUES (?, ?, ?, ?)",
            (stop_id, custom_name, group_name, service_no),
        )
        return cur.lastrowid


def delete_favourite(fav_id: int, path: Optional[str] = None) -> bool:
    with contextlib.closing(_conn(path)) as c, c:
        return c.execute("DELETE FROM favourites WHERE id = ?", (fav_id,)).rowcount > 0


def rename_favourite(fav_id: int, custom_name: str, path: Optional[str] = None) -> bool:
    with contextlib.closing(_conn(path)) as c, c:
        cur = c.execute(
            "UPDATE favourites SET custom_name = ? WHERE id = ?", (custom_name, fav_id)
        )
        return cur.rowcount > 0


def list_schedules(path: Optional[str] = None) -> list[dict]:
    with contextlib.closing(_conn(path)) as c, c:
        rows = c.execute("SELECT * FROM schedules ORDER BY start_time, id").fetchall()
        return [{**dict(r), "enabled": bool(r["enabled"])} for r in rows]


def add_schedule(
    stop_id: str,
    service_no: str,
    start_time: str,
    end_time: str,
    label: str = "",
    path: Optional[str] = None,
) -> int:
    with contextlib.closing(_conn(path)) as c, c:
        cur = c.execute(
            "INSERT INTO schedules (stop_id, service_no, start_time, end_time, label)"
            " VALUES (?, ?, ?, ?, ?)",
            (stop_id, service_no, start_time, end_time, label),
        )
        return cur.lastrowid


def update_schedule(schedule_id: int, fields: dict, path: Optional[str] = None) -> bool:
    if not fields:
        return False
    cols = ", ".join(f"{k} = ?" for k in fields)
    with contextlib.closing(_conn(path)) as c, c:
        cur = c.execute(
            f"UPDATE schedules SET {cols} WHERE id = ?", (*fields.values(), schedule_id)
        )
        return cur.rowcount > 0


def delete_schedule(schedule_id: int, path: Optional[str] = None) -> bool:
    with contextlib.closing(_conn(path)) as c, c:
        return c.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,)).rowcount > 0
