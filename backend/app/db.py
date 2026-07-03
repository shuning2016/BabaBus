import sqlite3
from typing import Optional

from .config import settings


def _conn(path: Optional[str] = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or settings.db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(path: Optional[str] = None) -> None:
    with _conn(path) as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS favourites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stop_id TEXT NOT NULL,
                custom_name TEXT NOT NULL,
                group_name TEXT NOT NULL DEFAULT 'Going out'
            )"""
        )


def list_favourites(path: Optional[str] = None) -> list[dict]:
    with _conn(path) as c:
        rows = c.execute("SELECT * FROM favourites ORDER BY group_name, id").fetchall()
        return [dict(r) for r in rows]


def add_favourite(stop_id: str, custom_name: str, group_name: str, path: Optional[str] = None) -> int:
    with _conn(path) as c:
        cur = c.execute(
            "INSERT INTO favourites (stop_id, custom_name, group_name) VALUES (?, ?, ?)",
            (stop_id, custom_name, group_name),
        )
        return cur.lastrowid


def delete_favourite(fav_id: int, path: Optional[str] = None) -> bool:
    with _conn(path) as c:
        return c.execute("DELETE FROM favourites WHERE id = ?", (fav_id,)).rowcount > 0


def rename_favourite(fav_id: int, custom_name: str, path: Optional[str] = None) -> bool:
    with _conn(path) as c:
        cur = c.execute(
            "UPDATE favourites SET custom_name = ? WHERE id = ?", (custom_name, fav_id)
        )
        return cur.rowcount > 0
