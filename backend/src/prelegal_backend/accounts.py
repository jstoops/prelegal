"""User accounts and their sign-in sessions.

A session is a random token in an HttpOnly cookie; only its hash is stored.
"""

import re
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated

from pydantic import AfterValidator, Field

from prelegal_backend.db import connect, timestamp
from prelegal_backend.documents import CamelModel
from prelegal_backend.security import (
    DUMMY_HASH,
    hash_password,
    hash_token,
    new_token,
    verify_password,
)

MIN_PASSWORD_LENGTH = 8
# scrypt's cost grows with the input, so very long passwords are refused.
MAX_PASSWORD_LENGTH = 128

# Deliberately loose: the real check would be a confirmation email.
EMAIL_PATTERN = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def _check_email(email: str) -> str:
    email = email.strip().lower()
    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        raise ValueError("Enter a valid email address.")
    return email


def _check_new_password(password: str) -> str:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Use a password of at least {MIN_PASSWORD_LENGTH} characters.")
    return password


Email = Annotated[str, AfterValidator(_check_email)]
Password = Annotated[str, Field(min_length=1, max_length=MAX_PASSWORD_LENGTH)]


class SignInRequest(CamelModel):
    email: Email
    password: Password


class SignUpRequest(SignInRequest):
    password: Annotated[Password, AfterValidator(_check_new_password)]


class AccountResponse(CamelModel):
    email: str


@dataclass(frozen=True)
class User:
    id: int
    email: str


class EmailTaken(Exception):
    """An account with this email already exists."""


class Accounts:
    def __init__(self, db_path: Path, session_ttl: timedelta) -> None:
        self.db_path = db_path
        self.session_ttl = session_ttl

    def create_user(self, email: str, password: str) -> User:
        """`email` must already be normalized (as `SignUpRequest` does)."""
        try:
            with connect(self.db_path) as conn:
                cursor = conn.execute(
                    "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
                    (email, hash_password(password), timestamp()),
                )
        except sqlite3.IntegrityError as exc:
            raise EmailTaken(email) from exc
        return User(id=cursor.lastrowid, email=email)

    def authenticate(self, email: str, password: str) -> User | None:
        with connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT id, email, password_hash FROM users WHERE email = ?", (email,)
            ).fetchone()
        if row is None:
            verify_password(password, DUMMY_HASH)
            return None
        if not verify_password(password, row["password_hash"]):
            return None
        return User(id=row["id"], email=row["email"])

    def start_session(self, user: User) -> str:
        """Returns the new session's token, for the cookie."""
        token = new_token()
        expires = timestamp(datetime.now(UTC) + self.session_ttl)
        with connect(self.db_path) as conn:
            # Tidy up while we're here: sessions only expire, nothing else removes them.
            conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (timestamp(),))
            conn.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (hash_token(token), user.id, expires),
            )
        return token

    def user_for_token(self, token: str) -> User | None:
        """The session's user, or None if the session is unknown or expired."""
        with connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id"
                " WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
                (hash_token(token), timestamp()),
            ).fetchone()
        return User(id=row["id"], email=row["email"]) if row else None

    def end_session(self, token: str) -> None:
        with connect(self.db_path) as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))
