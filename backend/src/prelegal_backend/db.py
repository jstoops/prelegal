"""Temporary SQLite database, created from scratch on every start.

There is no schema yet: tables arrive with the features that need them.
"""

import sqlite3
from contextlib import closing
from pathlib import Path


def reset_database(db_path: Path) -> None:
    """Delete any existing database (and its journal files) and create an empty one."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-journal", "-wal", "-shm"):
        db_path.with_name(db_path.name + suffix).unlink(missing_ok=True)
    sqlite3.connect(db_path).close()


def database_ok(db_path: Path) -> bool:
    # mode=rw opens existing databases only, so a missing file is reported
    # rather than silently recreated. as_uri() needs an absolute path.
    uri = f"{db_path.resolve().as_uri()}?mode=rw"
    try:
        with closing(sqlite3.connect(uri, uri=True)) as conn:
            conn.execute("SELECT 1").fetchone()
        return True
    except sqlite3.Error:
        return False
