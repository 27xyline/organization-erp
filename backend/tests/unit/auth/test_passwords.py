import pytest
from pydantic import ValidationError

from app.integrations.password_hash import Argon2PasswordHasher
from app.schemas.auth import CredentialsInput
from app.schemas.users import ChangePasswordInput, CreateUserInput, UpdateUserInput
from app.services.auth import DUMMY_PASSWORD_HASH


@pytest.mark.anyio
async def test_node_phc_dummy_and_round_trip_hash():
    passwords = Argon2PasswordHasher()
    assert not await passwords.verify(DUMMY_PASSWORD_HASH, "unknown-password")
    assert not passwords.needs_rehash(DUMMY_PASSWORD_HASH)
    node_encoded = (
        "$argon2id$v=19$m=19456,t=2,p=1$r5KKRvH1dJa4EhlY8dGGRA$"
        "vxHlrRLgANh4IHpCHVBc4O1VR0QFZaqGjUNZZKgyC24"
    )
    assert await passwords.verify(node_encoded, "auth-node-fixture!")
    encoded = await passwords.hash("password-test")
    assert encoded.startswith("$argon2id$v=19$m=19456,t=2,p=1$")
    assert await passwords.verify(encoded, "password-test")
    assert not await passwords.verify(encoded, "wrong")
    assert not await passwords.verify("malformed", "anything")


@pytest.mark.parametrize("password", ["x", "x" * 513, " "])
@pytest.mark.anyio
async def test_password_lengths_are_supported_across_schemas_and_hashing(password):
    assignment = {
        "role": "ADMIN",
        "departmentScopeMode": "ALL",
        "projectScopeMode": "ALL",
        "departmentIds": [],
        "projectIds": [],
    }
    assert CredentialsInput(username="user", password=password).password == password
    assert (
        CreateUserInput(
            username="user", name="User", assignments=[assignment], temporaryPassword=password
        ).temporaryPassword
        == password
    )
    assert UpdateUserInput(temporaryPassword=password).temporaryPassword == password
    assert ChangePasswordInput(currentPassword=password, newPassword=password + "x")
    hasher = Argon2PasswordHasher()
    encoded = await hasher.hash(password)
    assert await hasher.verify(encoded, password)
    assert not await hasher.verify(encoded, password + "x")


def test_passwords_cannot_be_empty():
    with pytest.raises(ValidationError):
        CredentialsInput(username="user", password="")
    with pytest.raises(ValidationError):
        UpdateUserInput(temporaryPassword="")
    with pytest.raises(ValidationError):
        ChangePasswordInput(currentPassword="x", newPassword="")
