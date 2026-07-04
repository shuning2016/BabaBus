"""Persistence for favourites and alarm schedules.

Local SQLite by default; when TURSO_URL/TURSO_TOKEN are set, the same
statements run against Turso (libSQL over HTTP). Vercel's filesystem is
ephemeral per serverless instance, so the hosted DB is what makes saved
data survive refreshes there.
"""
import contextlib
import sqlite3
from typing import Any, Optional

import httpx

from .config import settings

_turso_client: Optional[httpx.Client] = None


def _turso() -> httpx.Client:
    global _turso_client
    if _turso_client is None:
        _turso_client = httpx.Client(
            base_url=settings.turso_url.replace("libsql://", "https://"),
            headers={"Authorization": f"Bearer {settings.turso_token}"},
            timeout=10,
        )
    return _turso_client


def _encode(v: Any) -> dict:
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    return {"type": "text", "value": str(v)}


def _decode(cell: dict) -> Any:
    t = cell["type"]
    if t == "null":
        return None
    if t == "integer":
        return int(cell["value"])
    if t == "float":
        return float(cell["value"])
    return cell["value"]


def _turso_run(sql: str, args: tuple) -> dict:
    body = {
        "requests": [
            {"type": "execute", "stmt": {"sql": sql, "args": [_encode(a) for a in args]}},
            {"type": "close"},
        ]
    }
    res = _turso().post("/v2/pipeline", json=body)
    res.raise_for_status()
    first = res.json()["results"][0]
    if first["type"] == "error":
        raise sqlite3.OperationalError(first["error"]["message"])
    return first["response"]["result"]


def _run(sql: str, args: tuple = (), path: Optional[str] = None) -> dict:
    """Execute one statement; returns {"rows": [dict], "rowcount", "lastrowid"}."""
    if settings.turso_url and path is None:
        r = _turso_run(sql, args)
        cols = [c["name"] for c in r["cols"]]
        rows = [dict(zip(cols, map(_decode, row))) for row in r["rows"]]
        last = r.get("last_insert_rowid")
        return {
            "rows": rows,
            "rowcount": r.get("affected_row_count", 0),
            "lastrowid": int(last) if last is not None else None,
        }
    with contextlib.closing(sqlite3.connect(path or settings.db_path)) as c, c:
        c.row_factory = sqlite3.Row
        cur = c.execute(sql, args)
        return {
            "rows": [dict(row) for row in cur.fetchall()],
            "rowcount": cur.rowcount,
            "lastrowid": cur.lastrowid,
        }


def init_db(path: Optional[str] = None) -> None:
    _run(
        """CREATE TABLE IF NOT EXISTS favourites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stop_id TEXT NOT NULL,
            custom_name TEXT NOT NULL,
            group_name TEXT NOT NULL DEFAULT 'Going out',
            service_no TEXT
        )""",
        path=path,
    )
    try:  # migrate pre-existing databases created before service_no
        _run("ALTER TABLE favourites ADD COLUMN service_no TEXT", path=path)
    except sqlite3.OperationalError:
        pass
    _run(
        """CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stop_id TEXT NOT NULL,
            service_no TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            enabled INTEGER NOT NULL DEFAULT 1
        )""",
        path=path,
    )
    for col, decl in (
        ("remind_every", "INTEGER NOT NULL DEFAULT 1"),
        ("last_push", "INTEGER"),
        ("last_apple_push", "INTEGER"),  # iOS is notified once per window, tracked separately
        ("days", "TEXT NOT NULL DEFAULT '1111111'"),  # Mon..Sun mask
        ("services", "TEXT NOT NULL DEFAULT ''"),  # CSV of monitored bus nos; '' = all buses
    ):
        try:
            _run(f"ALTER TABLE schedules ADD COLUMN {col} {decl}", path=path)
        except sqlite3.OperationalError:
            pass
    # Backfill the multi-service column from the legacy single service_no once.
    _run(
        "UPDATE schedules SET services = service_no "
        "WHERE (services IS NULL OR services = '') AND service_no IS NOT NULL AND service_no != ''",
        path=path,
    )
    _run(
        """CREATE TABLE IF NOT EXISTS push_subscriptions (
            endpoint TEXT PRIMARY KEY,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL
        )""",
        path=path,
    )
    # Per-device ownership: each anonymous device scopes its own favourites,
    # alarms and push subscriptions. Pre-existing rows keep owner = NULL.
    for table in ("favourites", "schedules", "push_subscriptions"):
        try:
            _run(f"ALTER TABLE {table} ADD COLUMN owner TEXT", path=path)
        except sqlite3.OperationalError:
            pass
    # Registered accounts (social sign-in) and their opaque session tokens.
    _run(
        """CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            provider_uid TEXT NOT NULL,
            email TEXT,
            name TEXT,
            image TEXT,
            created_at INTEGER,
            UNIQUE(provider, provider_uid)
        )""",
        path=path,
    )
    _run(
        """CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            created_at INTEGER
        )""",
        path=path,
    )


def list_favourites(owner: str, path: Optional[str] = None) -> list[dict]:
    return _run(
        "SELECT * FROM favourites WHERE owner = ? ORDER BY group_name, id", (owner,), path=path
    )["rows"]


def add_favourite(
    stop_id: str,
    custom_name: str,
    group_name: str,
    service_no: Optional[str] = None,
    owner: Optional[str] = None,
    path: Optional[str] = None,
) -> int:
    return _run(
        "INSERT INTO favourites (stop_id, custom_name, group_name, service_no, owner)"
        " VALUES (?, ?, ?, ?, ?)",
        (stop_id, custom_name, group_name, service_no, owner),
        path=path,
    )["lastrowid"]


def delete_favourite(fav_id: int, owner: str, path: Optional[str] = None) -> bool:
    return _run(
        "DELETE FROM favourites WHERE id = ? AND owner = ?", (fav_id, owner), path=path
    )["rowcount"] > 0


def rename_favourite(fav_id: int, custom_name: str, owner: str, path: Optional[str] = None) -> bool:
    return _run(
        "UPDATE favourites SET custom_name = ? WHERE id = ? AND owner = ?",
        (custom_name, fav_id, owner),
        path=path,
    )["rowcount"] > 0


def list_schedules(owner: Optional[str] = None, path: Optional[str] = None) -> list[dict]:
    # owner=None returns every schedule (used by the cron tick across all devices).
    if owner is None:
        rows = _run("SELECT * FROM schedules ORDER BY start_time, id", path=path)["rows"]
    else:
        rows = _run(
            "SELECT * FROM schedules WHERE owner = ? ORDER BY start_time, id", (owner,), path=path
        )["rows"]
    return [{**r, "enabled": bool(r["enabled"])} for r in rows]


def add_schedule(
    stop_id: str,
    services: str,  # CSV of bus numbers; '' = all buses at the stop
    start_time: str,
    end_time: str,
    label: str = "",
    remind_every: int = 1,
    days: str = "1111111",
    owner: Optional[str] = None,
    path: Optional[str] = None,
) -> int:
    # service_no is legacy + NOT NULL; keep it populated with the first service.
    first = services.split(",")[0] if services else ""
    return _run(
        "INSERT INTO schedules (stop_id, service_no, services, start_time, end_time, label, remind_every, days, owner)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (stop_id, first, services, start_time, end_time, label, remind_every, days, owner),
        path=path,
    )["lastrowid"]


def set_last_push(schedule_id: int, epoch: int, path: Optional[str] = None) -> None:
    _run("UPDATE schedules SET last_push = ? WHERE id = ?", (epoch, schedule_id), path=path)


def set_last_apple_push(schedule_id: int, epoch: int, path: Optional[str] = None) -> None:
    _run("UPDATE schedules SET last_apple_push = ? WHERE id = ?", (epoch, schedule_id), path=path)


def add_subscription(
    endpoint: str, p256dh: str, auth: str, owner: Optional[str] = None, path: Optional[str] = None
) -> None:
    _run(
        "INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth, owner) VALUES (?, ?, ?, ?)",
        (endpoint, p256dh, auth, owner),
        path=path,
    )


def list_subscriptions(owner: Optional[str] = None, path: Optional[str] = None) -> list[dict]:
    # owner=None returns every subscription (the tick groups them by owner).
    if owner is None:
        return _run("SELECT * FROM push_subscriptions", path=path)["rows"]
    return _run("SELECT * FROM push_subscriptions WHERE owner = ?", (owner,), path=path)["rows"]


def delete_subscription(endpoint: str, path: Optional[str] = None) -> bool:
    return _run("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,), path=path)["rowcount"] > 0


def update_schedule(schedule_id: int, fields: dict, owner: str, path: Optional[str] = None) -> bool:
    if not fields:
        return False
    cols = ", ".join(f"{k} = ?" for k in fields)
    return _run(
        f"UPDATE schedules SET {cols} WHERE id = ? AND owner = ?",
        (*fields.values(), schedule_id, owner),
        path=path,
    )["rowcount"] > 0


def delete_schedule(schedule_id: int, owner: str, path: Optional[str] = None) -> bool:
    return _run(
        "DELETE FROM schedules WHERE id = ? AND owner = ?", (schedule_id, owner), path=path
    )["rowcount"] > 0


# --- Accounts & sessions -------------------------------------------------

def get_account(account_id: str, path: Optional[str] = None) -> Optional[dict]:
    rows = _run("SELECT * FROM accounts WHERE id = ?", (account_id,), path=path)["rows"]
    return rows[0] if rows else None


def get_account_by_provider(provider: str, provider_uid: str, path: Optional[str] = None) -> Optional[dict]:
    rows = _run(
        "SELECT * FROM accounts WHERE provider = ? AND provider_uid = ?",
        (provider, provider_uid),
        path=path,
    )["rows"]
    return rows[0] if rows else None


def upsert_account(
    new_id: str, provider: str, provider_uid: str, email, name, image, created_at: int,
    path: Optional[str] = None,
) -> str:
    """Return the account id, creating the row on first sign-in and refreshing
    the profile (email/name/image) on subsequent ones."""
    existing = get_account_by_provider(provider, provider_uid, path=path)
    if existing:
        _run(
            "UPDATE accounts SET email = ?, name = ?, image = ? WHERE id = ?",
            (email, name, image, existing["id"]),
            path=path,
        )
        return existing["id"]
    _run(
        "INSERT INTO accounts (id, provider, provider_uid, email, name, image, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (new_id, provider, provider_uid, email, name, image, created_at),
        path=path,
    )
    return new_id


def create_session(token: str, account_id: str, created_at: int, path: Optional[str] = None) -> None:
    _run(
        "INSERT INTO sessions (token, account_id, created_at) VALUES (?, ?, ?)",
        (token, account_id, created_at),
        path=path,
    )


def get_session_account_id(token: str, path: Optional[str] = None) -> Optional[str]:
    rows = _run("SELECT account_id FROM sessions WHERE token = ?", (token,), path=path)["rows"]
    return rows[0]["account_id"] if rows else None


def delete_session(token: str, path: Optional[str] = None) -> bool:
    return _run("DELETE FROM sessions WHERE token = ?", (token,), path=path)["rowcount"] > 0


def migrate_owner(from_owner: str, to_owner: str, path: Optional[str] = None) -> None:
    """Reassign a device's favourites/alarms/subscriptions to an account on sign-in."""
    for table in ("favourites", "schedules", "push_subscriptions"):
        _run(f"UPDATE {table} SET owner = ? WHERE owner = ?", (to_owner, from_owner), path=path)
