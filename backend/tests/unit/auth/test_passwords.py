import pytest

from app.integrations.password_hash import Argon2PasswordHasher
from app.services.auth import DUMMY_PASSWORD_HASH


@pytest.mark.anyio
async def test_node_phc_dummy_and_round_trip_hash():
    passwords = Argon2PasswordHasher()
    assert not await passwords.verify(DUMMY_PASSWORD_HASH, "unknown-password")
    assert not passwords.needs_rehash(DUMMY_PASSWORD_HASH)
    node_encoded = (
        "$argon2id$v=19$m=19456,t=2,p=1$u6a7EgmTwFr6eGDwexbeIg$"
        "cGEuqCucMSfmZdja40ModnAhO2sdbhkBgnc9/G1bksw"
    )
    assert await passwords.verify(node_encoded, "Stage03-node-fixture!")
    encoded = await passwords.hash("password-test")
    assert encoded.startswith("$argon2id$v=19$m=19456,t=2,p=1$")
    assert await passwords.verify(encoded, "password-test")
    assert not await passwords.verify(encoded, "wrong")
    assert not await passwords.verify("malformed", "anything")
