import asyncio
import base64
import hashlib
import json
from uuid import uuid4

import httpx
import pytest
from opentelemetry import trace
from sqlalchemy import delete, func, select, text, update

from app.api.dependencies import get_authenticated_context
from app.core.config import Settings
from app.core.context import Actor, RequestContext
from app.db.uow import SqlAlchemyUnitOfWork, create_unit_of_work_factory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.errors import DomainError
from app.integrations.document_rendering import DocumentRenderer
from app.integrations.document_storage import LocalDocumentStorage
from app.main import create_app
from app.models.documents import Document, DocumentVersion
from app.models.users import AuditLog, User, UserRoleAssignment
from app.services.documents import DocumentService
from app.services.dto.documents import DocumentCommand, DocumentQuery, Upload, VersionCommand

pytestmark = pytest.mark.anyio


async def chunks(content=b"first version"):
    yield content


@pytest.fixture
async def document_env(db_session_factory, tmp_path):
    prefix = "s8-" + uuid4().hex
    actors = []
    async with db_session_factory() as session:
        for index in range(2):
            identifier = prefix + str(index)
            session.add(
                User(
                    id=identifier,
                    username=identifier,
                    name="documents",
                    passwordHash="unused",
                    role="ADMIN",
                    mustChangePassword=False,
                )
            )
            actors.append(
                Actor(
                    identifier,
                    session_version=1,
                    access=AccessContext(
                        identifier, None, None, (), (ScopeGrant(identifier, "ADMIN", "ALL", "ALL"),)
                    ),
                )
            )
        await session.flush()
        for actor in actors:
            session.add(
                UserRoleAssignment(
                    userId=actor.actor_id,
                    role="ADMIN",
                    departmentScopeMode="ALL",
                    projectScopeMode="ALL",
                )
            )
        await session.commit()
    factory = create_unit_of_work_factory(db_session_factory)
    storage = LocalDocumentStorage(tmp_path)
    service = DocumentService(factory, storage, DocumentRenderer())
    try:
        yield prefix, actors, factory, service, storage, db_session_factory
    finally:
        from app.models.departments import Department
        from app.models.employees import Employee
        from app.models.projects import Project

        async with db_session_factory() as session:
            await session.execute(
                update(Document)
                .where(Document.createdById.in_([actor.actor_id for actor in actors]))
                .values(title=prefix, description=None)
            )
            await session.execute(delete(Project).where(Project.id == prefix))
            await session.execute(delete(Employee).where(Employee.id.like(prefix + "%")))
            await session.execute(delete(Department).where(Department.id == prefix))
            await session.execute(
                delete(UserRoleAssignment).where(
                    UserRoleAssignment.userId.in_([actor.actor_id for actor in actors])
                )
            )
            await session.execute(
                update(User)
                .where(User.id.in_([actor.actor_id for actor in actors]))
                .values(isActive=False)
            )
            await session.commit()
        storage.close()


async def test_upload_version_download_archive_atomic_audit(document_env):
    prefix, actors, factory, service, storage, sessions = document_env
    context = RequestContext(prefix, actor=actors[0])
    first = await service.create(
        DocumentCommand("Title", "Приказ.txt"), Upload(chunks(), "text/plain", 13), context
    )
    identifier = first.id
    assert first.currentVersion == 1
    assert first.versions[0].sizeBytes == 13
    second = await service.add_version(
        identifier,
        VersionCommand("a.txt", 1, "Change"),
        Upload(chunks(b"second"), "text/plain", 6),
        context,
    )
    assert (second.currentVersion, second.lockVersion) == (2, 2)
    download = await service.download(identifier, 1, context)
    assert b"".join(download.chunks()) == b"first version"
    assert download.file.closed
    updated = await service.change_status(identifier, "IN_REVIEW", 2, context)
    assert updated.lockVersion == 3
    archived = await service.archive(identifier, 3, context)
    assert archived.status == "ARCHIVED"
    assert (await service.list(DocumentQuery(archived=True), actors[0])).total >= 1
    with pytest.raises(DomainError) as error:
        await service.add_version(
            identifier, VersionCommand("a.txt", 4), Upload(chunks(), "text/plain", 13), context
        )
    assert error.value.code == "INVALID_STATE"
    with pytest.raises(DomainError) as stale_archived:
        await service.add_version(
            identifier, VersionCommand("a.txt", 1), Upload(chunks(), "text/plain", 13), context
        )
    assert stale_archived.value.code == "INVALID_STATE"
    async with sessions() as session:
        versions = (
            await session.scalars(
                select(DocumentVersion).where(DocumentVersion.documentId == identifier)
            )
        ).all()
        actions = (
            await session.scalars(
                select(AuditLog.action)
                .where(AuditLog.entityId == identifier)
                .order_by(AuditLog.createdAt)
            )
        ).all()
    assert len(versions) == 2
    assert actions == [
        "DOCUMENT_CREATED",
        "DOCUMENT_VERSION_ADDED",
        "DOCUMENT_DOWNLOADED",
        "DOCUMENT_STATUS_CHANGED",
        "DOCUMENT_ARCHIVED",
    ]


async def test_two_distinct_actors_physical_sessions_never_duplicate_version(document_env):
    prefix, actors, _, service, storage, sessions = document_env
    first = await service.create(
        DocumentCommand("Concurrency", "a.txt"),
        Upload(chunks(), "text/plain", 13),
        RequestContext(prefix, actor=actors[0]),
    )
    identifier = first.id
    ready = asyncio.Event()
    seen = []
    original_stage = storage.stage

    async def staged(upload, maximum):
        result = await original_stage(upload, maximum)
        seen.append(result)
        if len(seen) == 2:
            ready.set()
        await ready.wait()
        return result

    storage.stage = staged
    pids = []
    gate = asyncio.Event()

    class ConcurrentUow(SqlAlchemyUnitOfWork):
        async def __aenter__(self):
            await super().__aenter__()
            if ready.is_set():
                pids.append(await self._active_session().scalar(text("SELECT pg_backend_pid()")))
                if len(pids) == 2:
                    gate.set()
                await gate.wait()
            return self

    concurrent = DocumentService(lambda: ConcurrentUow(sessions), storage, DocumentRenderer())
    results = await asyncio.gather(
        *(
            concurrent.add_version(
                identifier,
                VersionCommand("a.txt", 1),
                Upload(chunks(), "text/plain", 13),
                RequestContext(prefix, actor=actor),
            )
            for actor in actors
        ),
        return_exceptions=True,
    )
    assert sum(not isinstance(result, BaseException) for result in results) == 1, results
    failures = [result for result in results if isinstance(result, DomainError)]
    assert [error.code for error in failures] == ["OPTIMISTIC_LOCK_CONFLICT"]
    assert len(set(pids[:2])) == 2
    async with sessions() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(DocumentVersion)
                .where(DocumentVersion.documentId == identifier)
            )
            == 2
        )
        row = await session.get(Document, identifier)
        assert row.currentVersion == 2 and row.lockVersion == 2
    assert len([path for path in storage.root.rglob("*") if path.is_file()]) == 2


async def test_real_http_full_binary_and_corrupt_file(document_env):
    prefix, actors, factory, service, storage, sessions = document_env
    app = create_app(Settings(otel_enabled=False, document_storage_root=storage.root))
    app.state.unit_of_work_factory = factory
    app.state.tracer = trace.get_tracer(__name__)
    app.dependency_overrides[get_authenticated_context] = lambda: RequestContext(
        prefix, actor=actors[0]
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        metadata = (
            base64.urlsafe_b64encode(
                json.dumps({"title": "Файл", "filename": "Приказ.txt"}).encode()
            )
            .decode()
            .rstrip("=")
        )
        response = await client.post(
            "/api/documents",
            content=b"complete bytes",
            headers={"x-document-metadata": metadata, "content-type": "text/plain"},
        )
        assert response.status_code == 201, response.text
        identifier = response.json()["data"]["id"]
        response = await client.get(f"/api/documents/{identifier}/download")
        assert response.content == b"complete bytes"
        assert response.headers["content-length"] == "14"
        assert (
            response.headers["etag"]
            == '"sha256-' + hashlib.sha256(response.content).hexdigest() + '"'
        )
        async with sessions() as session:
            version = await session.scalar(
                select(DocumentVersion).where(DocumentVersion.documentId == identifier)
            )
            key = version.storageKey
        (storage.root / key).write_bytes(b"corrupt")
        response = await client.get(f"/api/documents/{identifier}/download")
        assert response.status_code == 503
        assert response.json() == {
            "error": {
                "code": "STORAGE_CORRUPTED",
                "message": "Файл повреждён или отсутствует в хранилище",
            }
        }
        (storage.root / key).unlink()
        assert (await client.get(f"/api/documents/{identifier}/download")).status_code == 503


async def test_scope_multi_link_same_grant_and_denied_write_has_no_effect(document_env):
    from app.models.departments import Department
    from app.models.employees import Employee
    from app.models.projects import Project

    prefix, actors, factory, service, storage, sessions = document_env
    async with sessions() as session:
        session.add(Department(id=prefix, code=prefix, name=prefix))
        session.add(Project(id=prefix, code=prefix, name=prefix))
        await session.flush()
        session.add(
            Employee(
                id=prefix, code=prefix, fullName="Scoped", department=prefix, departmentId=prefix
            )
        )
        await session.commit()
    context = RequestContext(prefix, actor=actors[0])
    linked = await service.create(
        DocumentCommand("Linked", "a.txt", projectId=prefix, employeeId=prefix),
        Upload(chunks(), "text/plain", 13),
        context,
    )
    # Каждому разрешению по отдельности недоступна одна заполненная связь. Объединять отделы и
    # проекты запрещено.
    scope = AccessContext(
        "scoped",
        None,
        None,
        (),
        (
            ScopeGrant("department", "HR", "ASSIGNED", "NONE", (prefix,), ()),
            ScopeGrant("project", "PROJECT_MANAGER", "NONE", "ASSIGNED", (), (prefix,)),
        ),
    )
    actor = Actor("scoped", access=scope)
    assert (await service.list(DocumentQuery(search="Linked"), actor)).documents == ()
    with pytest.raises(DomainError) as error:
        await service.get(linked.id, actor)
    assert error.value.code == "NOT_FOUND"
    before = len([path for path in storage.root.rglob("*") if path.is_file()])
    with pytest.raises(DomainError) as error:
        await service.create(
            DocumentCommand("Denied", "a.txt", projectId=prefix, employeeId=prefix),
            Upload(chunks(), "text/plain", 13),
            RequestContext(prefix, actor=actor),
        )
    assert error.value.code == "FORBIDDEN"
    assert len([path for path in storage.root.rglob("*") if path.is_file()]) == before


async def test_audit_failure_rolls_back_document_version_and_compensates_file(document_env):
    from unittest.mock import AsyncMock

    prefix, actors, factory, service, storage, sessions = document_env

    class FailingAuditUow(SqlAlchemyUnitOfWork):
        async def __aenter__(self):
            await super().__aenter__()
            self.audit.append = AsyncMock(side_effect=RuntimeError("audit unavailable"))
            return self

    failing = DocumentService(lambda: FailingAuditUow(sessions), storage, DocumentRenderer())
    async with sessions() as session:
        before = await session.scalar(select(func.count()).select_from(Document))
    with pytest.raises(RuntimeError, match="audit unavailable"):
        await failing.create(
            DocumentCommand("Rollback", "a.txt"),
            Upload(chunks(), "text/plain", 13),
            RequestContext(prefix, actor=actors[0]),
        )
    async with sessions() as session:
        assert await session.scalar(select(func.count()).select_from(Document)) == before
        assert (
            await session.scalar(
                select(func.count())
                .select_from(DocumentVersion)
                .where(DocumentVersion.uploadedById == actors[0].actor_id)
            )
            == 0
        )
    assert [path for path in storage.root.rglob("*") if path.is_file()] == []


async def test_options_self_scope_exposes_only_self_employee(document_env):
    from app.models.departments import Department
    from app.models.employees import Employee

    prefix, actors, factory, service, storage, sessions = document_env
    async with sessions() as session:
        session.add(Department(id=prefix, code=prefix, name=prefix))
        await session.flush()
        for suffix in ("self", "other"):
            session.add(
                Employee(
                    id=prefix + suffix,
                    code=prefix + suffix,
                    fullName=suffix,
                    department=prefix,
                    departmentId=prefix,
                )
            )
        await session.commit()
    actor = Actor(
        "self",
        access=AccessContext(
            "self", prefix + "self", prefix, (), (ScopeGrant("g", "HR", "SELF", "NONE"),)
        ),
    )
    result = await service.options(actor)
    assert [row.id for row in result.employees] == [prefix + "self"]


@pytest.mark.parametrize(
    "template,category", [("PERSONNEL_ORDER", "ORDER"), ("ACCEPTANCE_ACT", "ACT")]
)
@pytest.mark.parametrize("format", ["docx", "pdf"])
async def test_generated_documents_real_http_integrity(document_env, template, category, format):
    from io import BytesIO

    from docx import Document as ParsedDocument

    prefix, actors, factory, service, storage, sessions = document_env
    app = create_app(Settings(otel_enabled=False, document_storage_root=storage.root))
    app.state.unit_of_work_factory = factory
    app.state.tracer = trace.get_tracer(__name__)
    app.dependency_overrides[get_authenticated_context] = lambda: RequestContext(
        prefix, actor=actors[0]
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/documents/generate",
            json={
                "template": template,
                "title": "Синтетический документ",
                "number": "08",
                "date": "2026-10-23",
                "subject": "Передача имущества",
                "details": "Передать ноутбук Иванову.",
                "basis": "Заявление",
                "format": format,
            },
        )
        assert response.status_code == 201, response.text
        document = response.json()["data"]
        assert document["category"] == category
        version = document["versions"][0]
        response = await client.get("/api/documents/" + document["id"] + "/download")
        assert response.status_code == 200
        assert hashlib.sha256(response.content).hexdigest() == version["sha256"]
        assert str(len(response.content)) == version["sizeBytes"]
        if format == "docx":
            paragraphs = ParsedDocument(BytesIO(response.content)).paragraphs
            assert "Передать ноутбук Иванову." in "\n".join(row.text for row in paragraphs)
        else:
            assert response.content.startswith(b"%PDF-") and b"/ToUnicode" in response.content


@pytest.mark.parametrize("declared", [5, None])
async def test_declared_and_streamed_size_limits_have_no_side_effect(document_env, declared):
    prefix, actors, factory, service, storage, sessions = document_env
    limited = DocumentService(factory, storage, DocumentRenderer(), maximum=4)
    with pytest.raises(DomainError) as error:
        await limited.create(
            DocumentCommand("Limit", "a.txt"),
            Upload(chunks(b"12345"), "text/plain", declared),
            RequestContext(prefix, actor=actors[0]),
        )
    assert error.value.code == "FILE_TOO_LARGE"
    async with sessions() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(Document)
                .where(Document.createdById == actors[0].actor_id)
            )
            == 0
        )
        assert (
            await session.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.userId == actors[0].actor_id)
            )
            == 0
        )
    assert [path for path in storage.root.rglob("*") if path.is_file()] == []


@pytest.mark.parametrize("outcome", ["commit", "rollback"])
async def test_recovery_waits_for_other_physical_transaction_outcome(document_env, outcome):
    """Потеря аренды на уровне ОС не доказывает завершение записывающего серверного процесса
    PostgreSQL.
    """
    prefix, actors, factory, service, storage, sessions = document_env
    first = await service.create(
        DocumentCommand("Fence", "a.txt"),
        Upload(chunks(), "text/plain", 13),
        RequestContext(prefix, actor=actors[0]),
    )
    staged = await storage.stage(Upload(chunks(b"in progress")), 100)
    await storage.promote(staged)
    await storage.abandon(staged)
    identifier = first.id
    async with sessions() as writer:
        await writer.begin()
        writer_pid = await writer.scalar(text("SELECT pg_backend_pid()"))
        from app.domain.documents.file_policy import FileMetadata
        from app.domain.documents.records import NewVersion
        from app.repositories.documents import SqlAlchemyDocumentRepository

        await SqlAlchemyDocumentRepository(lambda: writer).version(
            NewVersion(
                identifier,
                2,
                FileMetadata("a.txt", "txt", "text/plain"),
                staged.stored,
                actors[0].actor_id,
            )
        )
        await writer.execute(
            update(Document)
            .where(Document.id == identifier)
            .values(currentVersion=2, lockVersion=2)
        )
        reading = asyncio.Event()
        reader_pids = []

        class ReconcileUow(SqlAlchemyUnitOfWork):
            async def __aenter__(self):
                await super().__aenter__()
                reader_pids.append(
                    await self._active_session().scalar(text("SELECT pg_backend_pid()"))
                )
                reading.set()
                return self

        recovery_service = DocumentService(
            lambda: ReconcileUow(sessions), storage, DocumentRenderer()
        )
        recovery = asyncio.create_task(recovery_service.recover_storage())
        try:
            await reading.wait()
            assert reader_pids[0] != writer_pid
            for _ in range(100):
                assert not recovery.done(), "reconciliation trusted an unfenced MVCC absence"
                waiting = await writer.scalar(
                    text(
                        "SELECT EXISTS (SELECT 1 FROM pg_locks "
                        "WHERE pid = :pid AND locktype = 'advisory' AND NOT granted)"
                    ),
                    {"pid": reader_pids[0]},
                )
                if waiting:
                    break
                await asyncio.sleep(0.01)
            else:
                pytest.fail("recovery did not reach the writer's transaction fence")
            assert not recovery.done(), "reconciliation trusted an unfenced MVCC absence"
            assert (storage.root / staged.stored.key).is_file()
            if outcome == "commit":
                await writer.commit()
            else:
                await writer.rollback()
            assert await recovery == (0 if outcome == "commit" else 1)
            assert (storage.root / staged.stored.key).exists() == (outcome == "commit")
            assert await recovery_service.recover_storage() == 0
        finally:
            await writer.rollback()
            if not recovery.done():
                recovery.cancel()
            await asyncio.gather(recovery, return_exceptions=True)
