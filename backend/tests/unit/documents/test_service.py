from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.documents.records import LinkTarget, UserSummary
from app.domain.errors import DomainError
from app.services.documents import DocumentService
from app.services.dto.documents import DocumentCommand, DocumentView, StoredObject, Upload

pytestmark = pytest.mark.anyio


class Uow:
    def __init__(self):
        self.documents = SimpleNamespace(
            links=AsyncMock(return_value=LinkTarget()),
            create=AsyncMock(return_value="doc"),
            version=AsyncMock(),
            get=AsyncMock(
                return_value=DocumentView(
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
            ),
            referenced=AsyncMock(return_value=False),
        )
        self.users = SimpleNamespace(
            get=AsyncMock(
                return_value=SimpleNamespace(
                    id="actor",
                    is_active=True,
                    session_version=0,
                    must_change_password=False,
                    employee_id=None,
                    employee_department_id=None,
                    member_project_ids=(),
                    grants=(ScopeGrant("g", "ADMIN", "ALL", "ALL"),),
                )
            )
        )
        self.audit = SimpleNamespace(append=AsyncMock())
        self.commit = AsyncMock()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


def context():
    return RequestContext(
        "r",
        actor=Actor(
            "actor",
            access=AccessContext(
                "actor", None, None, (), (ScopeGrant("g", "ADMIN", "ALL", "ALL"),)
            ),
        ),
    )


async def chunks():
    yield b"hello"


async def test_create_commits_document_version_and_exact_audit_before_finishing():
    uow = Uow()
    staged = SimpleNamespace(stored=StoredObject("aa/bb/" + "0" * 36, 5, "f" * 64))
    storage = SimpleNamespace(
        stage=AsyncMock(return_value=staged),
        promote=AsyncMock(),
        finish=AsyncMock(),
        delete=AsyncMock(),
        abandon=AsyncMock(),
    )
    service = DocumentService(lambda: uow, storage, AsyncMock())
    await service.create(
        DocumentCommand("Title", "a.txt"), Upload(chunks(), "text/plain", 5), context()
    )
    assert uow.documents.version.await_args.kwargs == {}
    assert uow.documents.version.await_args.args[0].versionNumber == 1
    assert uow.audit.append.await_args.args[0].details == {
        "category": "GENERAL",
        "status": "DRAFT",
        "version": 1,
        "mimeType": "text/plain",
        "sizeBytes": "5",
        "projectId": None,
        "employeeId": None,
        "assetId": None,
    }
    uow.commit.assert_awaited_once()
    storage.finish.assert_awaited_once()


async def test_scope_denial_does_not_stage_any_file():
    uow = Uow()
    storage = AsyncMock()
    service = DocumentService(lambda: uow, storage, AsyncMock())
    actor = Actor("no", access=AccessContext("no", None, None, (), ()))
    with pytest.raises(DomainError) as error:
        await service.create(
            DocumentCommand("Title", "a.txt"),
            Upload(chunks(), "text/plain", 5),
            RequestContext("r", actor=actor),
        )
    assert error.value.code == "FORBIDDEN"
    storage.stage.assert_not_called()


@pytest.mark.parametrize("committed", [False, True])
async def test_commit_failure_checks_reference_before_compensation(committed, tmp_path):
    from app.integrations.document_storage import LocalDocumentStorage

    uow = Uow()
    uow.commit.side_effect = ConnectionError("lost commit acknowledgement")
    uow.documents.referenced.return_value = committed
    storage = LocalDocumentStorage(tmp_path)
    service = DocumentService(lambda: uow, storage, AsyncMock())
    with pytest.raises(ConnectionError):
        await service.create(
            DocumentCommand("Title", "a.txt"), Upload(chunks(), "text/plain", 5), context()
        )
    files = [p for p in tmp_path.rglob("*") if p.is_file()]
    assert len(files) == int(committed)


async def test_commit_failure_and_unavailable_reconciliation_retains_recoverable_journal(tmp_path):
    from app.integrations.document_storage import LocalDocumentStorage

    uow = Uow()
    uow.commit.side_effect = ConnectionError("lost acknowledgement")
    uow.documents.referenced.side_effect = ConnectionError("database unavailable")
    storage = LocalDocumentStorage(tmp_path)
    service = DocumentService(lambda: uow, storage, AsyncMock())
    with pytest.raises(ConnectionError):
        await service.create(
            DocumentCommand("Title", "a.txt"), Upload(chunks(), "text/plain", 5), context()
        )
    assert len(list((tmp_path / ".staging").glob("*.pending"))) == 1
    uow.documents.referenced.side_effect = None
    uow.documents.referenced.return_value = False
    assert await service.recover_storage() == 1
    assert [p for p in tmp_path.rglob("*") if p.is_file()] == []


async def test_post_commit_finish_failure_returns_success_and_is_recoverable(tmp_path):
    from app.integrations.document_storage import LocalDocumentStorage

    uow = Uow()
    uow.documents.referenced.return_value = True
    storage = LocalDocumentStorage(tmp_path)
    finish = storage.finish
    storage.finish = AsyncMock(side_effect=OSError("journal cleanup failed"))
    service = DocumentService(lambda: uow, storage, AsyncMock())
    result = await service.create(
        DocumentCommand("Title", "a.txt"), Upload(chunks(), "text/plain", 5), context()
    )
    assert result.id == "doc"
    uow.commit.assert_awaited_once()
    assert len(list((tmp_path / ".staging").glob("*.pending"))) == 1
    storage.finish = finish
    assert await service.recover_storage() == 0
    assert list((tmp_path / ".staging").iterdir()) == []


async def test_promote_failure_has_no_database_write_or_current_orphan(tmp_path):
    from app.integrations.document_storage import LocalDocumentStorage

    uow = Uow()
    storage = LocalDocumentStorage(tmp_path)
    storage.promote = AsyncMock(side_effect=OSError("promote failed"))
    service = DocumentService(lambda: uow, storage, AsyncMock())
    with pytest.raises(OSError, match="promote failed"):
        await service.create(
            DocumentCommand("Title", "a.txt"), Upload(chunks(), "text/plain", 5), context()
        )
    uow.documents.create.assert_not_awaited()
    assert [path for path in tmp_path.rglob("*") if path.is_file()] == []


async def test_cancelled_upload_waits_for_promotion_worker_before_compensation(
    tmp_path, monkeypatch
):
    import asyncio
    import threading

    import app.integrations.document_storage as storage_module
    from app.integrations.document_storage import LocalDocumentStorage

    uow = Uow()
    storage = LocalDocumentStorage(tmp_path)
    entered = threading.Event()
    release = threading.Event()
    completed = threading.Event()
    original_link = storage_module.os.link

    def blocked_link(*args, **kwargs):
        entered.set()
        assert release.wait(5)
        try:
            return original_link(*args, **kwargs)
        finally:
            completed.set()

    monkeypatch.setattr(storage_module.os, "link", blocked_link)
    service = DocumentService(lambda: uow, storage, AsyncMock())
    task = asyncio.create_task(
        service.create(
            DocumentCommand("Title", "a.txt"), Upload(chunks(), "text/plain", 5), context()
        )
    )
    try:
        assert await asyncio.to_thread(entered.wait, 5)
        task.cancel()
        await asyncio.sleep(0.05)
        assert not task.done(), "cleanup ran while its promotion worker still owned the file"
    finally:
        release.set()
        result = await asyncio.gather(task, return_exceptions=True)
        assert await asyncio.to_thread(completed.wait, 5)
    assert isinstance(result[0], asyncio.CancelledError)
    assert [p for p in tmp_path.rglob("*") if p.is_file()] == []
    assert await service.recover_storage() == 0
