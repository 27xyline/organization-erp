import base64
import json
from datetime import datetime
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from opentelemetry import trace

from app.api.dependencies import get_authenticated_context
from app.api.routes.documents import service
from app.core.config import Settings
from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.documents.records import DocumentOptions, UserSummary
from app.main import create_app
from app.services.dto.documents import DocumentPage, DocumentView, Download

pytestmark = pytest.mark.anyio


def encoded(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")


@pytest.fixture
async def transport(tmp_path):
    app = create_app(Settings(otel_enabled=False, document_storage_root=tmp_path))
    app.state.tracer = trace.get_tracer(__name__)
    actor = Actor(
        "admin",
        access=AccessContext("admin", None, None, (), (ScopeGrant("g", "ADMIN", "ALL", "ALL"),)),
    )
    view = DocumentView(
        "doc",
        "Title",
        "GENERAL",
        "DRAFT",
        1,
        1,
        "actor",
        datetime.min,
        datetime.min,
        UserSummary("actor", "Actor", "actor"),
    )
    mocked = SimpleNamespace(
        **{
            name: AsyncMock(return_value=view)
            for name in ["get", "create", "generate", "add_version", "change_status", "archive"]
        },
        list=AsyncMock(return_value=DocumentPage((view,), 1)),
        options=AsyncMock(return_value=DocumentOptions((), (), ())),
        download=AsyncMock(
            return_value=Download(BytesIO(b"hello"), 5, "a" * 64, "Приказ.txt", "text/plain")
        ),
    )
    app.dependency_overrides[get_authenticated_context] = lambda: RequestContext(
        "request", actor=actor
    )
    app.dependency_overrides[service] = lambda: mocked
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, mocked, app


@pytest.mark.parametrize(
    "method,path,kwargs,status",
    [
        ("GET", "/api/documents", {}, 200),
        ("GET", "/api/documents/doc", {}, 200),
        ("GET", "/api/documents/options", {}, 200),
        (
            "POST",
            "/api/documents",
            {
                "content": b"hello",
                "headers": {
                    "content-type": "text/plain",
                    "x-document-metadata": encoded({"title": "Title", "filename": "a.txt"}),
                },
            },
            201,
        ),
        (
            "POST",
            "/api/documents/doc/versions",
            {
                "content": b"hello",
                "headers": {
                    "content-type": "text/plain",
                    "x-document-metadata": encoded({"filename": "a.txt", "lockVersion": 1}),
                },
            },
            201,
        ),
        ("PATCH", "/api/documents/doc", {"json": {"status": "IN_REVIEW", "lockVersion": 1}}, 200),
        ("POST", "/api/documents/doc/archive", {"json": {"lockVersion": 1}}, 200),
        (
            "POST",
            "/api/documents/generate",
            {
                "json": {
                    "template": "PERSONNEL_ORDER",
                    "title": "Title",
                    "number": "1",
                    "date": "2026-10-23",
                    "subject": "Subject",
                    "details": "Details",
                }
            },
            201,
        ),
        ("GET", "/api/documents/doc/download", {}, 200),
    ],
)
async def test_complete_method_matrix(transport, method, path, kwargs, status):
    client, mocked, _ = transport
    result = await client.request(method, path, **kwargs)
    assert result.status_code == status, result.text
    if path.endswith("/download"):
        assert result.content == b"hello"
        assert result.headers["etag"] == '"sha256-' + "a" * 64 + '"'
        assert "filename*=UTF-8''%D0" in result.headers["content-disposition"]
        assert mocked.download.return_value.file.closed
    else:
        assert "data" in result.json()


@pytest.mark.parametrize(
    "method,path,kwargs,code",
    [
        ("POST", "/api/documents", {"content": b"x"}, "MISSING_METADATA"),
        ("POST", "/api/documents", {"headers": {"x-document-metadata": "!"}}, "INVALID_METADATA"),
        (
            "POST",
            "/api/documents",
            {
                "headers": {
                    "x-document-metadata": encoded({"title": "A", "filename": "a.txt"}),
                    "content-length": "-1",
                }
            },
            "INVALID_CONTENT_LENGTH",
        ),
        ("POST", "/api/documents/doc/archive", {"content": "{"}, "INVALID_METADATA"),
        (
            "PATCH",
            "/api/documents/doc",
            {"json": {"status": "SIGNED", "lockVersion": 0}},
            "VALIDATION_ERROR",
        ),
        ("GET", "/api/documents?archived=0", {}, "VALIDATION_ERROR"),
    ],
)
async def test_error_contracts(transport, method, path, kwargs, code):
    client, _, _ = transport
    response = await client.request(method, path, **kwargs)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == code


async def test_permission_precedes_body_and_schema_validation(transport):
    client, mocked, app = transport
    app.dependency_overrides[get_authenticated_context] = lambda: RequestContext(
        "request", actor=Actor("denied", access=AccessContext("denied", None, None, (), ()))
    )
    response = await client.post("/api/documents", content=b"bad")
    assert response.status_code == 403
    assert response.json() == {"error": {"code": "FORBIDDEN", "message": "Недостаточно прав"}}
    mocked.create.assert_not_called()


async def test_stream_send_failure_closes_verified_snapshot():
    from starlette.requests import ClientDisconnect

    from app.api.routes.documents import DocumentStreamingResponse

    result = Download(BytesIO(b"complete bytes"), 14, "a" * 64, "a.txt", "text/plain")
    response = DocumentStreamingResponse(result, {})

    async def receive():
        return {"type": "http.disconnect"}

    async def send(message):
        if message["type"] == "http.response.body":
            raise OSError("client disconnected")

    with pytest.raises(ClientDisconnect):
        await response(
            {"type": "http", "method": "GET", "asgi": {"spec_version": "2.4"}}, receive, send
        )
    assert result.file.closed


async def test_source_coercion_edges_and_blank_link_validation(transport):
    client, mocked, _ = transport
    for date, millisecond in [(None, 0), (0, 0), (True, 1000)]:
        response = await client.post(
            "/api/documents/generate",
            json={
                "template": "PERSONNEL_ORDER",
                "title": "Title",
                "number": "1",
                "date": date,
                "subject": "Subject",
                "details": "Details",
            },
        )
        assert response.status_code == 201, response.text
        assert mocked.generate.await_args.args[0].date.year == 1970
        assert mocked.generate.await_args.args[0].date.microsecond == millisecond
    response = await client.post(
        "/api/documents",
        content=b"x",
        headers={
            "content-type": "text/plain",
            "x-document-metadata": encoded(
                {"title": "Title", "filename": "a.txt", "projectId": " "}
            ),
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["fieldErrors"] == {
        "projectId": ["String must contain at least 1 character(s)"]
    }
