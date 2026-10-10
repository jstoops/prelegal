import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from prelegal_backend.db import connect, database_ok, reset_database, timestamp

TABLES = [("documents",), ("sessions",), ("users",)]


def tables(db_path: Path) -> list[tuple[str]]:
    with closing(sqlite3.connect(db_path)) as conn:
        return sorted(conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall())


def test_reset_creates_the_schema_and_parent_dirs(tmp_path):
    db_path = tmp_path / "nested" / "dir" / "prelegal.db"
    reset_database(db_path)
    assert db_path.is_file()
    assert tables(db_path) == TABLES


def test_reset_discards_existing_data_and_journal_files(tmp_path):
    db_path = tmp_path / "prelegal.db"
    with closing(sqlite3.connect(db_path)) as conn:
        conn.execute("CREATE TABLE leftover (id INTEGER)")
        assert conn.execute("SELECT name FROM sqlite_master").fetchall() == [("leftover",)]
    journal = tmp_path / "prelegal.db-journal"
    journal.write_text("stale")

    reset_database(db_path)

    assert tables(db_path) == TABLES
    assert not journal.exists()


def test_database_ok(tmp_path):
    db_path = tmp_path / "prelegal.db"
    assert not database_ok(db_path)  # missing file is not silently created
    assert not db_path.exists()
    reset_database(db_path)
    assert database_ok(db_path)


def test_database_ok_with_relative_path(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    db_path = Path("data") / "prelegal.db"
    reset_database(db_path)
    assert database_ok(db_path)


def test_connect_commits_or_rolls_back(tmp_path):
    db_path = tmp_path / "prelegal.db"
    reset_database(db_path)
    insert = "INSERT INTO users (email, password_hash, created_at) VALUES (?, 'x', ?)"
    with connect(db_path) as conn:
        conn.execute(insert, ("kept@example.com", timestamp()))
    with pytest.raises(RuntimeError):
        with connect(db_path) as conn:
            conn.execute(insert, ("dropped@example.com", timestamp()))
            raise RuntimeError
    with connect(db_path) as conn:
        assert [r["email"] for r in conn.execute("SELECT email FROM users")] == ["kept@example.com"]


def test_connect_enforces_foreign_keys(tmp_path):
    db_path = tmp_path / "prelegal.db"
    reset_database(db_path)
    with pytest.raises(sqlite3.IntegrityError):
        with connect(db_path) as conn:
            conn.execute("INSERT INTO sessions VALUES ('hash', 42, ?)", (timestamp(),))


def test_timestamps_sort_in_time_order():
    early = datetime(2026, 10, 9, 12, 0, 0, tzinfo=UTC)
    later = early + timedelta(microseconds=1)
    assert timestamp(early) < timestamp(later)
    assert timestamp(early) == "2026-10-09T12:00:00.000000+00:00"
