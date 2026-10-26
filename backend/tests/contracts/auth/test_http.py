import httpx
import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.main import create_app
from tests.auth_support import PASSWORD

CSRF_SECRET = "runtime-csrf-contract-secret-xxxxxxxx"
PUBLIC_ORIGIN = "http://test"


def app_settings(database_url: str) -> Settings:
    return Settings(
        database_url=database_url,
        csrf_secret=SecretStr(CSRF_SECRET),
        public_origin=PUBLIC_ORIGIN,
        environment="test",
        otel_enabled=False,
    )


async def login(client: httpx.AsyncClient, username: str, password: str = PASSWORD):
    csrf_response = await client.get("/api/auth/csrf")
    csrf = csrf_response.json()["csrfToken"]
    headers = {"origin": PUBLIC_ORIGIN, "x-csrf-token": csrf}
    response = await client.post(
        "/api/auth/login",
        headers=headers,
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return headers


@pytest.mark.anyio
async def test_authenticated_api_rejects_legacy_bearer_identity_without_session():
    app = create_app(
        Settings(database_url="postgresql://localhost/unreachable", otel_enabled=False)
    )
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=PUBLIC_ORIGIN) as client,
    ):
        assert (await client.get("/api/health/live")).status_code == 200
        response = await client.get("/api/users", headers={"authorization": "Bearer obsolete"})
        assert response.status_code == 401
        retired_endpoint = await client.post(
            "/api/internal/auth/credentials",
            json={"username": "admin", "password": "anything"},
        )
        assert retired_endpoint.status_code == 404


@pytest.mark.anyio
async def test_forced_password_change_revokes_old_session(auth_env):
    env = auth_env
    identifier = await env["seed"](forced=True)
    app = create_app(app_settings(env["url"]))
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=PUBLIC_ORIGIN) as client,
    ):
        headers = await login(client, identifier)
        actor = await client.get("/api/account/me")
        assert actor.status_code == 200 and actor.json()["data"]["mustChangePassword"]
        restricted = await client.get("/api/users")
        assert restricted.status_code == 403
        assert restricted.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"

        wrong = await client.post(
            "/api/account/password",
            headers=headers,
            json={"currentPassword": "wrong", "newPassword": "new-password"},
        )
        assert wrong.status_code == 422
        changed = await client.post(
            "/api/account/password",
            headers=headers,
            json={"currentPassword": PASSWORD, "newPassword": "new-password"},
        )
        assert changed.status_code == 200
        assert (await client.get("/api/account/me")).status_code == 401
        assert await login(client, identifier, "new-password")


@pytest.mark.anyio
async def test_users_http_create_patch_envelopes_and_validation(auth_env):
    env = auth_env
    identifier = await env["seed"]()
    app = create_app(app_settings(env["url"]))
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=PUBLIC_ORIGIN) as client,
    ):
        headers = await login(client, identifier)
        assignment = {
            "role": "ADMIN",
            "departmentScopeMode": "ALL",
            "projectScopeMode": "ALL",
            "departmentIds": [],
            "projectIds": [],
        }
        input = {
            "username": env["prefix"] + "-api",
            "name": "API User",
            "temporaryPassword": "temporary-password",
            "assignments": [assignment],
        }
        created = await client.post("/api/users", headers=headers, json=input)
        assert created.status_code == 201
        user = created.json()["data"]
        env["ids"].append(user["id"])
        assert set(user) == {
            "id",
            "username",
            "name",
            "role",
            "employeeId",
            "employee",
            "roleAssignments",
            "isActive",
            "mustChangePassword",
            "lockedUntil",
            "lastLoginAt",
            "createdAt",
            "updatedAt",
        }
        assert user["createdAt"].endswith("Z") and user["lockedUntil"] is None

        duplicate = await client.post("/api/users", headers=headers, json=input)
        assert duplicate.status_code == 409
        assert duplicate.json()["error"]["code"] == "USERNAME_EXISTS"
        invalid = await client.post(
            "/api/users",
            headers=headers,
            json=input | {"username": env["prefix"] + "-invalid", "employeeId": "missing"},
        )
        assert invalid.status_code == 422
        patch = await client.patch(
            "/api/users/" + user["id"],
            headers=headers,
            json={"name": "Changed name", "employeeId": None},
        )
        assert patch.status_code == 200 and patch.json()["data"]["name"] == "Changed name"
        null = await client.patch("/api/users/" + user["id"], headers=headers, json={"name": None})
        assert null.status_code == 422
        empty = await client.patch("/api/users/" + user["id"], headers=headers, json={})
        assert empty.status_code == 422
