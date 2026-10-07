import sqlite3
from contextlib import closing
from pathlib import Path

from prelegal_backend.db import database_ok, reset_database


def test_reset_creates_empty_database_and_parent_dirs(tmp_path):
    db_path = tmp_path / "nested" / "dir" / "prelegal.db"
    reset_database(db_path)
    assert db_path.is_file()
    with closing(sqlite3.connect(db_path)) as conn:
        tables = conn.execute("SELECT name FROM sqlite_master").fetchall()
    assert tables == []


def test_reset_discards_existing_data_and_journal_files(tmp_path):
    db_path = tmp_path / "prelegal.db"
    with closing(sqlite3.connect(db_path)) as conn:
        conn.execute("CREATE TABLE leftover (id INTEGER)")
        assert conn.execute("SELECT name FROM sqlite_master").fetchall() == [("leftover",)]
    journal = tmp_path / "prelegal.db-journal"
    journal.write_text("stale")

    reset_database(db_path)

    with closing(sqlite3.connect(db_path)) as conn:
        assert conn.execute("SELECT name FROM sqlite_master").fetchall() == []
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
