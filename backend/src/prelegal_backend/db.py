"""Temporary SQLite database, created from scratch on every start.

Users, their sign-in sessions and their saved documents are lost on restart.
"""

import sqlite3
from collections.abc import Iterator
from contextlib import closing, contextmanager
from datetime import UTC, datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE sessions (
    -- sha256 of the cookie's token: a leaked database can't sign anyone in.
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE TABLE documents (
    -- Random, so ids can't be guessed (ownership is checked as well).
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- The catalog id, e.g. "mutual-nda".
    document_id TEXT NOT NULL,
    title TEXT NOT NULL,
    -- DocumentData and the chat messages, as camelCase JSON.
    data TEXT NOT NULL,
    messages TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX documents_by_user ON documents(user_id, updated_at DESC);
"""


def reset_database(db_path: Path) -> None:
    """Delete any existing database (and its journal files) and create a fresh one."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-journal", "-wal", "-shm"):
        db_path.with_name(db_path.name + suffix).unlink(missing_ok=True)
    with closing(sqlite3.connect(db_path)) as conn:
        conn.executescript(SCHEMA)


@contextmanager
def connect(db_path: Path) -> Iterator[sqlite3.Connection]:
    """A connection that commits on success and rolls back on error.

    One per request: sqlite3 connections belong to the thread that opened them,
    and sync routes run in a threadpool.
    """
    with closing(sqlite3.connect(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        with conn:  # commits, or rolls back on an exception
            yield conn


def timestamp(moment: datetime | None = None) -> str:
    """A UTC time (default now) as stored in the database. ISO strings in one
    format sort and compare in time order."""
    return (moment or datetime.now(UTC)).astimezone(UTC).isoformat(timespec="microseconds")


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
