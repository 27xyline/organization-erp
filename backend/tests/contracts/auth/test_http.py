import time

import httpx
import jwt
import pytest

from app.core.config import Settings
from app.main import create_app
from tests.auth_support import BRIDGE_SECRET, INTERNAL_SECRET, PASSWORD


def proof(identifier, version=1):
    now = int(time.time())
    return {
        "authorization": "Bearer "
        + jwt.encode(
            {
                "sub": identifier,
                "sessionVersion": version,
                "iss": "erp-next",
                "aud": "erp-python",
                "iat": now,
                "exp": now + 60,
            },
            BRIDGE_SECRET,
            algorithm="HS256",
        )
    }


@pytest.mark.anyio
async def test_health_without_secrets_but_auth_fails_closed():
    app = create_app(
        Settings(
            database_url="postgresql://localhost/unreachable",
            bridge_secret=None,
            internal_auth_secret=None,
            otel_enabled=False,
        )
    )
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client,
    ):
        assert (await client.get("/api/health/live")).status_code == 200
        assert (await client.get("/api/users")).status_code == 503
        assert (
            await client.post(
                "/api/internal/auth/credentials", json={"username": "admin", "password": "anything"}
            )
        ).status_code == 503


@pytest.mark.anyio
async def test_internal_credentials_is_service_authenticated_and_uniform(auth_env):
    env = auth_env
    identifier = await env["seed"]()
    disabled = await env["seed"](active=False)
    app = create_app(
        Settings(
            database_url=env["url"],
            bridge_secret=BRIDGE_SECRET,
            internal_auth_secret=INTERNAL_SECRET,
            otel_enabled=False,
        )
    )
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client,
    ):
        endpoint = "/api/internal/auth/credentials"
        data = {"username": identifier, "password": PASSWORD}
        assert (await client.post(endpoint, json=data)).status_code == 401
        assert (
            await client.post(endpoint, json=data, headers=proof(identifier))
        ).status_code == 401
        headers = {"authorization": "Bearer " + INTERNAL_SECRET}
        for username in (identifier, disabled, "missing"):
            response = await client.post(
                endpoint, json={"username": username, "password": "wrong"}, headers=headers
            )
            assert response.status_code == 200 and response.json() == {"data": None}
        response = await client.post(endpoint, json=data, headers=headers)
        assert response.status_code == 200
        assert response.json()["data"]["id"] == identifier
        assert set(response.json()["data"]) == {
            "id",
            "name",
            "username",
            "role",
            "roles",
            "sessionVersion",
            "mustChangePassword",
        }


@pytest.mark.anyio
async def test_forced_password_change_stale_session_and_untrusted_headers(auth_env):
    env = auth_env
    identifier = await env["seed"](forced=True)
    app = create_app(
        Settings(
            database_url=env["url"],
            bridge_secret=BRIDGE_SECRET,
            internal_auth_secret=INTERNAL_SECRET,
            otel_enabled=False,
        )
    )
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client,
    ):
        response = await client.get(
            "/api/users", headers={"x-user-id": identifier, "x-role": "ADMIN"}
        )
        assert response.status_code == 401
        headers = proof(identifier) | {"x-request-id": "stage03-http-test"}
        actor = await client.get("/api/internal/auth/actor", headers=headers)
        assert actor.status_code == 200 and actor.json()["data"]["mustChangePassword"]
        response = await client.get("/api/users", headers=headers)
        assert (
            response.status_code == 403
            and response.json()["error"]["code"] == "PASSWORD_CHANGE_REQUIRED"
        )
        assert response.headers["x-request-id"] == "stage03-http-test"
        wrong = await client.post(
            "/api/account/password",
            headers=headers,
            json={"currentPassword": "wrong", "newPassword": "new-password"},
        )
        assert (
            wrong.status_code == 422 and wrong.json()["error"]["code"] == "INVALID_CURRENT_PASSWORD"
        )
        change = await client.post(
            "/api/account/password",
            headers=headers,
            json={"currentPassword": PASSWORD, "newPassword": "new-password"},
        )
        assert change.json() == {"data": {"success": True}}
        assert (await client.get("/api/internal/auth/actor", headers=headers)).status_code == 401
        fresh = proof(identifier, 2)
        result = await client.get("/api/users?page=1&pageSize=3", headers=fresh)
        assert result.status_code == 200 and result.json()["pagination"]["pageSize"] == 3
        assert result.json()["pagination"]["totalPages"] >= 1
        assert (await client.get("/api/users/references", headers=fresh)).status_code == 200
        invalid = await client.patch(
            "/api/users/" + identifier, headers=fresh, json={"isActive": "false"}
        )
        assert invalid.status_code == 422 and invalid.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.anyio
async def test_users_http_create_patch_envelopes_and_legacy_error_messages(auth_env):
    env = auth_env
    identifier = await env["seed"]()
    app = create_app(
        Settings(
            database_url=env["url"],
            bridge_secret=BRIDGE_SECRET,
            internal_auth_secret=INTERNAL_SECRET,
            otel_enabled=False,
        )
    )
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
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client,
    ):
        headers = proof(identifier)
        create = await client.post("/api/users", headers=headers, json=input)
        assert create.status_code == 201
        user = create.json()["data"]
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
        assert duplicate.json() == {
            "error": {
                "code": "USERNAME_EXISTS",
                "message": "Пользователь с таким логином уже существует",
            }
        }
        scope_error = await client.post(
            "/api/users",
            headers=headers,
            json=input | {"username": env["prefix"] + "-invalid", "employeeId": "missing"},
        )
        assert scope_error.status_code == 422
        assert (
            scope_error.json()["error"]["message"]
            == "Проверьте роли, области доступа и связь с сотрудником"
        )
        patch = await client.patch(
            "/api/users/" + user["id"],
            headers=headers,
            json={"name": "Changed name", "employeeId": None},
        )
        assert patch.status_code == 200 and patch.json()["data"]["name"] == "Changed name"
        null = await client.patch("/api/users/" + user["id"], headers=headers, json={"name": None})
        assert null.status_code == 422 and null.json()["error"]["code"] == "VALIDATION_ERROR"
        empty = await client.patch("/api/users/" + user["id"], headers=headers, json={})
        assert empty.status_code == 422
