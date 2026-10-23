import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.core.context import Actor, RequestContext
from app.domain.errors import DomainError
from app.models.approvals import ApprovalRequest
from app.models.documents import Document
from app.models.enums import DocumentStatus
from app.models.notifications import Notification
from app.models.users import AuditLog
from app.repositories.notifications import SqlAlchemyNotificationRepository
from app.services.dto.approvals import ApprovalCommand, ApprovalDecisionCommand, ApprovalStepCommand


def command(env, *, entity_type=None, entity_id=None):
    return ApprovalCommand(
        title="Review Stage09 document",
        description="Two-step approval",
        documentId=env.document_id,
        entityType=entity_type,
        entityId=entity_id,
        dueAt=datetime.now(UTC) + timedelta(days=1),
        steps=(
            ApprovalStepCommand(env.approver_one, "Первый этап"),
            ApprovalStepCommand(env.approver_two, "Второй этап"),
        ),
    )


def actor_context(env, user_id):
    return RequestContext(
        env.context.request_id,
        actor=Actor(
            user_id,
            is_authenticated=True,
            session_version=1,
            access=env.context.actor.access,
        ),
    )


@pytest.mark.anyio
async def test_two_step_approval_updates_document_and_notifies_next_actor(approval_env):
    env = approval_env
    request = await env.service.create(command(env), env.context)
    assert request["status"] == "PENDING"
    assert [step["status"] for step in request["steps"]] == ["PENDING", "WAITING"]

    result = await env.service.decide(
        request["id"], ApprovalDecisionCommand("APPROVE"), actor_context(env, env.approver_one)
    )
    assert result["nextApproverId"] == env.approver_two

    async with env.session_factory() as session:
        stored = await session.get(ApprovalRequest, request["id"])
        document = await session.get(Document, env.document_id)
        notifications = (
            await session.scalars(
                select(Notification).where(Notification.userId == env.approver_two)
            )
        ).all()
        assert stored is not None and stored.currentStep == 2 and stored.lockVersion == 2
        assert document is not None and document.status == DocumentStatus.IN_REVIEW
        assert document.lockVersion == 2
        assert [(n.eventType.value, n.dedupeKey) for n in notifications] == [
            ("APPROVAL_REQUESTED", f"approval:{request['id']}:step:2")
        ]


@pytest.mark.anyio
async def test_templates_and_approver_options_preserve_active_order(approval_env):
    env = approval_env
    options = await env.service.approvers(env.context)
    assert {item["id"] for item in options} >= {env.approver_one, env.approver_two}

    steps = [
        {"approverId": env.approver_one, "name": "First"},
        {"approverId": env.approver_two, "name": "Second"},
    ]
    created = await env.service.create_template("Stage09 route", steps, env.context)
    assert created["steps"] == steps and created["isActive"] is True
    assert any(item["id"] == created["id"] for item in await env.service.templates(env.context))
    with pytest.raises(DomainError) as duplicate:
        await env.service.create_template("Stage09 route", steps, env.context)
    assert duplicate.value.code == "APPROVAL_TEMPLATE_EXISTS"

    updated = await env.service.update_template(created["id"], {"isActive": False}, env.context)
    assert updated["isActive"] is False
    templates = await env.service.templates(env.context)
    assert any(item["id"] == created["id"] and not item["isActive"] for item in templates)


@pytest.mark.anyio
async def test_rejecting_second_step_and_cancel_restore_document_and_lock_versions(approval_env):
    env = approval_env
    request = await env.service.create(command(env), env.context)
    await env.service.decide(
        request["id"], ApprovalDecisionCommand("APPROVE"), actor_context(env, env.approver_one)
    )
    result = await env.service.decide(
        request["id"],
        ApprovalDecisionCommand("REJECT", "Needs changes"),
        actor_context(env, env.approver_two),
    )
    assert result["status"] == "REJECTED"
    async with env.session_factory() as session:
        stored = await session.get(ApprovalRequest, request["id"])
        document = await session.get(Document, env.document_id)
        assert stored is not None and stored.lockVersion == 3
        assert document is not None and document.status == DocumentStatus.DRAFT
        assert document.lockVersion == 3

    cancelled = await env.service.create(command(env), env.context)
    result = await env.service.cancel(cancelled["id"], env.context)
    # The legacy endpoint returns the pre-cancel request snapshot.
    assert result["status"] == "PENDING"
    async with env.session_factory() as session:
        stored = await session.get(ApprovalRequest, cancelled["id"])
        document = await session.get(Document, env.document_id)
        assert stored is not None and stored.status.value == "CANCELLED" and stored.lockVersion == 2
        assert document is not None and document.status == DocumentStatus.DRAFT
        assert document.lockVersion == 5


@pytest.mark.anyio
async def test_concurrent_decisions_serialize_and_only_one_succeeds(approval_env):
    env = approval_env
    request = await env.service.create(command(env), env.context)
    context = actor_context(env, env.approver_one)
    outcomes = await asyncio.gather(
        env.service.decide(request["id"], ApprovalDecisionCommand("APPROVE"), context),
        env.service.decide(request["id"], ApprovalDecisionCommand("APPROVE"), context),
        return_exceptions=True,
    )
    assert sum(not isinstance(value, Exception) for value in outcomes) == 1
    failures = [value for value in outcomes if isinstance(value, DomainError)]
    assert len(failures) == 1 and failures[0].code in {"FORBIDDEN", "INVALID_STATE"}
    async with env.session_factory() as session:
        stored = await session.get(ApprovalRequest, request["id"])
        assert stored is not None and stored.currentStep == 2 and stored.lockVersion == 2


@pytest.mark.anyio
async def test_unknown_entity_rejects_without_creating_a_dangling_approval(approval_env):
    env = approval_env
    with pytest.raises(DomainError) as failure:
        await env.service.create(
            command(env, entity_type="UnknownRecord", entity_id="ghost"), env.context
        )
    assert failure.value.code == "REFERENCE_NOT_FOUND"
    async with env.session_factory() as session:
        assert (
            await session.scalar(
                select(func.count())
                .select_from(ApprovalRequest)
                .where(ApprovalRequest.requestedById == env.requester)
            )
            == 0
        )
        document = await session.get(Document, env.document_id)
        assert document is not None and document.status == DocumentStatus.DRAFT
        assert document.lockVersion == 1


@pytest.mark.anyio
async def test_notification_enqueue_failure_rolls_back_approval_document_and_audit(
    approval_env, monkeypatch
):
    env = approval_env

    async def fail_enqueue(self, intent):
        raise RuntimeError("synthetic enqueue failure")

    monkeypatch.setattr(SqlAlchemyNotificationRepository, "enqueue", fail_enqueue)
    with pytest.raises(RuntimeError, match="synthetic enqueue failure"):
        await env.service.create(command(env), env.context)

    async with env.session_factory() as session:
        document = await session.get(Document, env.document_id)
        assert document is not None and document.status == DocumentStatus.DRAFT
        assert document.lockVersion == 1
        assert (
            await session.scalar(
                select(func.count())
                .select_from(ApprovalRequest)
                .where(ApprovalRequest.requestedById == env.requester)
            )
            == 0
        )
        assert (
            await session.scalar(
                select(func.count()).select_from(AuditLog).where(AuditLog.userId == env.requester)
            )
            == 0
        )
