from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

import pytest
from sqlalchemy import delete, text

from app.core.context import Actor, RequestContext
from app.db.uow import create_unit_of_work_factory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.approvals import ApprovalRequest, ApprovalTemplate
from app.models.documents import Document, DocumentVersion
from app.models.enums import DocumentStatus
from app.models.notifications import Notification, NotificationOutbox
from app.models.users import AuditLog, User
from app.services.approvals import ApprovalService


@dataclass
class ApprovalEnv:
    service: ApprovalService
    requester: str
    approver_one: str
    approver_two: str
    context: RequestContext
    factory: object
    session_factory: object
    document_id: str


@pytest.fixture
async def approval_env(db_session_factory):
    prefix = "s09-" + uuid4().hex
    ids = (prefix + "-requester", prefix + "-approver-1", prefix + "-approver-2")
    access = AccessContext(prefix, None, None, (), (ScopeGrant(prefix, "ADMIN", "ALL", "ALL"),))
    actor = Actor(ids[0], is_authenticated=True, session_version=1, access=access)
    context = RequestContext(prefix, actor=actor)
    async with db_session_factory() as session:
        for identifier, label in zip(
            ids, ("Requester", "Approver one", "Approver two"), strict=True
        ):
            session.add(
                User(
                    id=identifier,
                    username=identifier,
                    name=label,
                    passwordHash="unused",
                    mustChangePassword=False,
                    role="ADMIN",
                )
            )
        document = Document(
            id=prefix + "-document",
            title="Stage09 document",
            createdById=ids[0],
            status=DocumentStatus.DRAFT,
        )
        session.add(document)
        session.add(
            DocumentVersion(
                id=prefix + "-version",
                documentId=document.id,
                versionNumber=1,
                storageKey="aa/bb/00000000-0000-4000-8000-000000000001",
                originalFilename="stage09.pdf",
                mimeType="application/pdf",
                extension="pdf",
                sizeBytes=1,
                sha256="0" * 64,
                uploadedById=ids[0],
            )
        )
        await session.commit()
    factory = create_unit_of_work_factory(db_session_factory)
    env = ApprovalEnv(
        ApprovalService(factory), *ids, context, factory, db_session_factory, document.id
    )
    try:
        yield env
    finally:
        async with db_session_factory() as session:
            await session.execute(
                delete(ApprovalRequest).where(ApprovalRequest.requestedById == ids[0])
            )
            await session.execute(delete(Notification).where(Notification.userId.in_(ids)))
            await session.execute(
                delete(NotificationOutbox).where(NotificationOutbox.userId.in_(ids))
            )
            await session.execute(delete(AuditLog).where(AuditLog.userId.in_(ids)))
            await session.execute(
                delete(ApprovalTemplate).where(ApprovalTemplate.createdById == ids[0])
            )
            # The production trigger makes document versions immutable; disable it
            # transactionally only while removing this isolated test fixture.
            await session.execute(
                text(
                    'ALTER TABLE "document_versions" DISABLE TRIGGER "document_versions_immutable"'
                )
            )
            await session.execute(delete(Document).where(Document.id == document.id))
            await session.execute(
                text('ALTER TABLE "document_versions" ENABLE TRIGGER "document_versions_immutable"')
            )
            await session.execute(delete(User).where(User.id.in_(ids)))
            await session.commit()
