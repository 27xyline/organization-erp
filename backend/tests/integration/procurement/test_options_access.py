from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.core.context import Actor, RequestContext
from app.db.uow import SqlAlchemyUnitOfWorkFactory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.documents import Document, DocumentVersion
from app.models.projects import Project
from app.models.users import User
from app.services.procurement import ProcurementService


@pytest.mark.anyio
async def test_options_documents_follow_document_read_scope(stage11_session_factory) -> None:
    suffix = uuid4().hex[:10]
    user_id = f"options-user-{suffix}"
    project_a, project_b = f"options-a-{suffix}", f"options-b-{suffix}"
    async with stage11_session_factory() as session:
        session.add_all(
            [
                User(
                    id=user_id,
                    username=user_id,
                    name="Пользователь",
                    passwordHash="hash",
                    mustChangePassword=False,
                ),
                Project(id=project_a, code=f"A-{suffix}", name="Проект A"),
                Project(id=project_b, code=f"B-{suffix}", name="Проект B"),
            ]
        )
        await session.flush()
        documents = [
            Document(id=f"doc-a-{suffix}", title="Доступный", projectId=project_a,
                     createdById=user_id),
            Document(id=f"doc-b-{suffix}", title="Чужой", projectId=project_b,
                     createdById=user_id),
            Document(id=f"doc-archived-{suffix}", title="Архивный", projectId=project_a,
                     createdById=user_id, status="ARCHIVED",
                     archivedAt=datetime.now(UTC).replace(tzinfo=None)),
        ]
        session.add_all(documents)
        session.add_all(
            DocumentVersion(
                id=f"version-{document.id}",
                documentId=document.id,
                versionNumber=1,
                storageKey=f"aa/bb/{uuid4()}",
                originalFilename=f"{document.id}.pdf",
                mimeType="application/pdf",
                extension="pdf",
                sizeBytes=1,
                sha256="0" * 64,
                uploadedById=user_id,
            )
            for document in documents
        )
        await session.commit()

    service = ProcurementService(SqlAlchemyUnitOfWorkFactory(stage11_session_factory))

    def context(project_mode: str, project_ids: tuple[str, ...] = ()) -> RequestContext:
        access = AccessContext(
            user_id=user_id,
            employee_id=None,
            employee_department_id=None,
            member_project_ids=(),
            grants=(ScopeGrant("scope", "ADMIN", "ALL", project_mode,
                               project_ids=project_ids),),
        )
        return RequestContext(
            request_id=f"options-{suffix}",
            actor=Actor(user_id, roles=("ADMIN",), is_authenticated=True, access=access),
        )

    scoped = await service.options(context("ASSIGNED", (project_a,)))
    assert [item["id"] for item in scoped["documents"]] == [f"doc-a-{suffix}"]

    all_scope = await service.options(context("ALL"))
    visible_ids = {item["id"] for item in all_scope["documents"]}
    assert {f"doc-a-{suffix}", f"doc-b-{suffix}"} <= visible_ids
    assert f"doc-archived-{suffix}" not in visible_ids
