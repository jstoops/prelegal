from prelegal_backend.security import hash_password, hash_token, new_token, verify_password


def test_password_round_trip():
    encoded = hash_password("s3cret-password")
    assert encoded.startswith("scrypt$16384$8$1$")
    assert "s3cret-password" not in encoded
    assert verify_password("s3cret-password", encoded)
    assert not verify_password("wrong-password", encoded)


def test_hashes_are_salted():
    assert hash_password("same password") != hash_password("same password")


def test_malformed_hashes_never_match():
    for encoded in ("", "plain", "bcrypt$1$2$3$c2FsdA==$a2V5", "scrypt$x$8$1$c2FsdA==$a2V5", "scrypt$16384$8$1$!!$!!"):
        assert not verify_password("anything", encoded), encoded


def test_tokens_are_random_and_hashed():
    token = new_token()
    assert len(token) >= 40
    assert token != new_token()
    assert hash_token(token) == hash_token(token)
    assert token not in hash_token(token)
