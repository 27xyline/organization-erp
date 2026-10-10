import time

import jwt
import pytest

from app.domain.errors import DomainError
from app.integrations.auth_bridge import verify_bridge

SECRET = "bridge-test-secret-64-bytes-minimum-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"


def claims():
    now = int(time.time())
    return dict(
        sub="user", sessionVersion=1, iss="erp-next", aud="erp-python", iat=now, exp=now + 60
    )


def test_valid_bridge():
    assert verify_bridge(jwt.encode(claims(), SECRET, algorithm="HS256"), SECRET) == ("user", 1)


@pytest.mark.parametrize(
    "change",
    [
        {"aud": "other"},
        {"iss": "other"},
        {"exp": 1},
        {"sessionVersion": True},
        {"sessionVersion": 0},
        {"iat": True},
        {"exp": int(time.time()) + 120},
        {"sub": ""},
    ],
)
def test_bridge_rejects_invalid_claims(change):
    with pytest.raises(DomainError) as failure:
        verify_bridge(jwt.encode(claims() | change, SECRET, algorithm="HS256"), SECRET)
    assert failure.value.code == "UNAUTHENTICATED"


@pytest.mark.parametrize(
    "token",
    [
        jwt.encode(claims(), SECRET, algorithm="HS384"),
        jwt.encode(claims(), "wrong-secret-long-enough-for-test", algorithm="HS256"),
        jwt.encode({"sub": "user"}, SECRET, algorithm="HS256"),
    ],
)
def test_bridge_rejects_algorithm_signature_and_missing_claims(token):
    with pytest.raises(DomainError):
        verify_bridge(token, SECRET)
