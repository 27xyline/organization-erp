import httpx
import pytest
from opentelemetry import trace
from pydantic import SecretStr

from app.api.dependencies import get_actor, get_sessions_service
from app.core.config import Settings
from app.core.context import Actor
from app.main import create_app
from app.services.dto.auth import CredentialResult

CSRF_SECRET = "stage14b-csrf-test-secret-unique-xxxxxxxx"


class FakeSessions:
    async def login(self, username, password):
        if password != "correct-password":
            return None
        return (
            CredentialResult("u1", "Test User", username, "ADMIN", ("ADMIN",), 1, False),
            "opaque-session-token-that-is-not-a-real-credential",
        )

    async def logout(self, token):
        self.logged_out = token


@pytest.fixture
async def client():
    app = create_app(
        Settings(
            csrf_secret=SecretStr(CSRF_SECRET),
            public_origin="https://erp.example",
            environment="production",
            otel_enabled=False,
        )
    )
    app.state.tracer = trace.get_tracer("stage14b-contract")
    service = FakeSessions()
    app.dependency_overrides[get_sessions_service] = lambda: service
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="https://erp.example"
    ) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_csrf_endpoint_sets_signed_cookie_without_disclosing_secret(client):
    response = await client.get("/api/auth/csrf")

    assert response.status_code == 200
    token = response.json()["csrfToken"]
    assert token != CSRF_SECRET
    assert token in response.headers["set-cookie"]
    assert "HttpOnly" not in response.headers["set-cookie"]
    assert "Secure" in response.headers["set-cookie"]
    assert "Path=/" in response.headers["set-cookie"]
    assert "Domain=" not in response.headers["set-cookie"]
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.anyio
async def test_login_requires_valid_tokens_and_public_origin(client):
    csrf = (await client.get("/api/auth/csrf")).json()["csrfToken"]
    headers = {"origin": "https://attacker.example", "x-csrf-token": csrf}
    response = await client.post(
        "/api/auth/login",
        headers=headers | {"cookie": f"erp_csrf={csrf}"},
        json={"username": "person", "password": "correct-password"},
    )
    assert response.status_code == 403

    response = await client.post(
        "/api/auth/login",
        headers={"x-csrf-token": "wrong", "cookie": f"erp_csrf={csrf}"},
        json={"username": "person", "password": "correct-password"},
    )
    assert response.status_code == 403

    response = await client.post(
        "/api/auth/login",
        headers={
            "origin": "https://erp.example",
            "x-csrf-token": csrf,
            "cookie": f"erp_csrf={csrf}",
        },
        json={"username": "person", "password": "correct-password"},
    )
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "erp_session=opaque-session-token-that-is-not-a-real-credential" in cookie
    assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=lax" in cookie
    assert "Path=/" in cookie and "Domain=" not in cookie
    assert "token" not in response.text


@pytest.mark.anyio
async def test_session_cookie_unsafe_methods_require_csrf_centrally(client):
    response = await client.post(
        "/api/account/password",
        headers={
            "origin": "https://erp.example",
            "cookie": "erp_session=opaque-session-token-that-is-not-a-real-credential",
        },
        json={"currentPassword": "old-password", "newPassword": "new-password"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_INVALID"


@pytest.mark.anyio
async def test_account_me_returns_only_the_actor_contract():
    app = create_app(
        Settings(
            _env_file=None,
            csrf_secret=None,
            otel_enabled=False,
        )
    )
    app.state.tracer = trace.get_tracer("stage14b-contract")
    app.dependency_overrides[get_actor] = lambda: Actor(
        actor_id="u1",
        username="user.one",
        name="Test User",
        role="ADMIN",
        roles=("ADMIN",),
        permissions=("dashboard.read",),
        session_version=3,
        is_authenticated=True,
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as test_client:
        response = await test_client.get("/api/account/me")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    data = response.json()["data"]
    assert set(data) == {
        "id",
        "name",
        "username",
        "role",
        "roles",
        "permissions",
        "employeeId",
        "mustChangePassword",
        "sessionVersion",
        "access",
    }
    assert "passwordHash" not in data and "token" not in data and "secret" not in data


@pytest.mark.anyio
async def test_missing_csrf_secret_fails_closed_as_auth_unavailable():
    app = create_app(
        Settings(
            _env_file=None,
            csrf_secret=None,
            otel_enabled=False,
        )
    )
    app.state.tracer = trace.get_tracer("stage14b-contract")
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as test_client:
        response = await test_client.post("/api/auth/login", json={})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AUTH_UNAVAILABLE"
