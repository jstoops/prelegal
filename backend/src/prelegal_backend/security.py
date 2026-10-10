"""Password hashing and session tokens, using only the standard library."""

import base64
import hashlib
import hmac
import secrets

# scrypt's recommended interactive parameters (about 16 MiB and tens of ms).
_N, _R, _P = 2**14, 8, 1
_KEY_LENGTH = 32


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode(), salt=salt, n=n, r=r, p=p, maxmem=64 * 1024 * 1024, dklen=_KEY_LENGTH
    )


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def hash_password(password: str) -> str:
    """A salted hash, stored with its parameters ("scrypt$n$r$p$salt$hash") so
    they can be raised later without breaking existing accounts."""
    salt = secrets.token_bytes(16)
    key = _scrypt(password, salt, _N, _R, _P)
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(key)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, n, r, p, salt, key = encoded.split("$")
        if scheme != "scrypt":
            return False
        actual = _scrypt(password, base64.b64decode(salt), int(n), int(r), int(p))
        return hmac.compare_digest(actual, base64.b64decode(key))
    except ValueError:
        return False  # a malformed hash


# Checked when an email has no account, so signing in takes as long either way
# and the timing doesn't reveal which emails are registered.
DUMMY_HASH = hash_password(secrets.token_urlsafe())


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Tokens are random and long, so a fast hash is enough (no salt needed)."""
    return hashlib.sha256(token.encode()).hexdigest()
