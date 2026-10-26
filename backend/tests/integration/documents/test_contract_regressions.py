"""Точное воспроизведение исходных синтетических HTTP-запросов; нормализуются только идентификаторы
и время.
"""

import base64
import hashlib
import json
from pathlib import Path

import httpx
import pytest
from opentelemetry import trace
from sqlalchemy import func, select, update

from app.api.dependencies import get_authenticated_context
from app.core.config import Settings
from app.core.context import RequestContext
from app.main import create_app
from app.models.documents import Document
from app.models.notifications import NotificationOutbox
from app.models.users import AuditLog, User

pytestmark = pytest.mark.anyio
GOLDEN = json.loads((Path(__file__).parents[2] / "fixtures/contracts/documents.json").read_text())


def normalized(value, identities, key=""):
    if isinstance(value, dict):
        return {k: normalized(v, identities, k) for k, v in value.items()}
    if isinstance(value, list):
        return [normalized(v, identities, key) for v in value]
    if value is not None and (key == "id" or key.endswith("Id")):
        return identities.setdefault(value, "identity-" + str(len(identities)))
    if value is not None and key in ("createdAt", "updatedAt", "archivedAt"):
        assert isinstance(value, str)
        return "<timestamp>"
    return value


def assert_typed_equal(actual, expected):
    assert type(actual) is type(expected), (actual, expected)
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys()
        for key in expected:
            assert_typed_equal(actual[key], expected[key])
    elif isinstance(expected, list):
        assert len(actual) == len(expected)
        for left, right in zip(actual, expected, strict=True):
            assert_typed_equal(left, right)
    else:
        assert actual == expected


async def test_full_document_dto_state_audit_and_binary_source_replay(document_env):
    prefix, actors, factory, service, storage, sessions = document_env
    calls = GOLDEN["calls"]
    creator = calls["upload-v1"]["response"]["data"]["createdBy"]
    async with sessions() as session:
        # Предыдущие запуски сохраняют неизменяемые версии. Перед повтором убираем только
        # этот известный синтетический заголовок, чтобы исходный поисковый запрос оставался точным.
        await session.execute(
            update(Document)
            .where(Document.title == calls["upload-v1"]["request"]["metadata"]["title"])
            .values(title="Retired documents synthetic replay", description=None)
        )
        outbox_before = await session.scalar(select(func.count()).select_from(NotificationOutbox))
        await session.execute(
            update(User)
            .where(User.id == actors[0].actor_id)
            .values(name=creator["name"], username=creator["username"])
        )
        await session.commit()
    app = create_app(Settings(otel_enabled=False, document_storage_root=storage.root))
    app.state.unit_of_work_factory = factory
    app.state.tracer = trace.get_tracer(__name__)
    app.dependency_overrides[get_authenticated_context] = lambda: RequestContext(
        prefix, actor=actors[0]
    )
    expected_ids = {}
    actual_ids = {}

    def compare(response, name):
        assert response.status_code == calls[name]["status"], response.text
        assert_typed_equal(
            normalized(response.json(), actual_ids),
            normalized(calls[name]["response"], expected_ids),
        )

    def upload_arguments(name):
        request = calls[name]["request"]
        encoded = (
            base64.urlsafe_b64encode(json.dumps(request["metadata"]).encode()).decode().rstrip("=")
        )
        return {
            "content": request["bodyUtf8"].encode(),
            "headers": {"x-document-metadata": encoded, "content-type": request["contentType"]},
        }

    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:

            async def listing(name):
                params = {
                    k: ("true" if v is True else "false" if v is False else v)
                    for k, v in calls[name]["request"]["query"].items()
                }
                compare(await client.get("/api/documents", params=params), name)

            await listing("list-empty")
            response = await client.post("/api/documents", **upload_arguments("upload-v1"))
            compare(response, "upload-v1")
            identifier = response.json()["data"]["id"]
            await listing("list-after-upload")
            compare(await client.get("/api/documents/" + identifier), "detail")

            async def download(name, version=None):
                response = await client.get(
                    "/api/documents/" + identifier + "/download",
                    params={} if version is None else {"version": version},
                )
                assert response.status_code == calls[name]["status"]
                assert len(response.content) == calls[name]["byteLength"]
                assert hashlib.sha256(response.content).hexdigest() == calls[name]["sha256"]
                for key, value in calls[name]["headers"].items():
                    if key == "contentDisposition":
                        assert "attachment;" in response.headers["content-disposition"]
                        assert "filename*=UTF-8''" in response.headers["content-disposition"]
                    else:
                        assert response.headers[key] == value

            await download("download-v1", 1)
            compare(
                await client.post(
                    "/api/documents/" + identifier + "/versions", **upload_arguments("upload-v2")
                ),
                "upload-v2",
            )
            await download("download-v2", 2)
            await download("download-current-v2")
            compare(
                await client.patch(
                    "/api/documents/" + identifier,
                    json=calls["status-to-in-review"]["request"]["json"],
                ),
                "status-to-in-review",
            )
            compare(
                await client.post(
                    "/api/documents/" + identifier + "/archive",
                    json=calls["archive"]["request"]["json"],
                ),
                "archive",
            )
            await listing("list-archived")
        async with sessions() as session:
            audit = (
                await session.scalars(
                    select(AuditLog)
                    .where(AuditLog.entityId == identifier)
                    .order_by(AuditLog.createdAt, AuditLog.id)
                )
            ).all()
        async with sessions() as session:
            assert (
                await session.scalar(select(func.count()).select_from(NotificationOutbox))
                == outbox_before
            )
        expected = [
            {k: row[k] for k in ("action", "entityType", "details")}
            for row in GOLDEN["audit"]
            if row["action"] != "DOCUMENT_CREATED" or row["details"]["category"] == "GENERAL"
        ][:7]
        assert_typed_equal(
            [
                {"action": row.action, "entityType": row.entityType, "details": row.details}
                for row in audit
            ],
            expected,
        )
    finally:
        async with sessions() as session:
            await session.execute(
                update(User)
                .where(User.id == actors[0].actor_id)
                .values(username=actors[0].actor_id)
            )
            await session.commit()
