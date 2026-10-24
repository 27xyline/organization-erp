from app.integrations.session_security import (
    create_csrf_token,
    hash_session_token,
    new_session_token,
    validate_csrf_request,
    verify_csrf_token,
)


def test_session_tokens_are_opaque_256_bit_values_and_only_hash_is_persisted() -> None:
    token = new_session_token()

    assert len(token) >= 43
    assert hash_session_token(token) != token
    assert len(hash_session_token(token)) == 64
    assert hash_session_token(token) == hash_session_token(token)
    assert hash_session_token("untrusted-cookie-💩")


def test_csrf_token_is_signed_and_tampering_is_rejected() -> None:
    token = create_csrf_token("csrf-secret-that-is-long-enough-for-hmac")

    assert verify_csrf_token(token, "csrf-secret-that-is-long-enough-for-hmac")
    assert not verify_csrf_token(token + "x", "csrf-secret-that-is-long-enough-for-hmac")
    assert not verify_csrf_token(token, "different-secret-that-is-also-long-enough")


def test_csrf_checks_tokens_without_origin_and_rejects_wrong_origin() -> None:
    secret = "csrf-secret-that-is-long-enough-for-hmac"
    token = create_csrf_token(secret)

    assert validate_csrf_request(token, token, secret, None, None)
    assert not validate_csrf_request("", token, secret, None, None)
    assert not validate_csrf_request("💩", token, secret, None, None)
    assert not validate_csrf_request(token, "wrong", secret, None, None)
    assert not validate_csrf_request(
        token, token, secret, "https://attacker.example", "https://erp.example"
    )
    assert validate_csrf_request(
        token, token, secret, "https://erp.example", "https://erp.example/"
    )
