"""Approval use cases; state, audit and notification intents share one UoW."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from app.core.context import RequestContext
from app.domain.approvals.rules import fail, utc_naive, validate_deadline
from app.domain.enums import ApprovalRequestStatus, ApprovalStepStatus, DocumentStatus
from app.domain.errors import DomainError, PersistenceConflict
from app.domain.ports.audit import AuditRecord
from app.domain.ports.notifications import NotificationIntent
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.approvals import ApprovalCommand, ApprovalDecisionCommand
from app.services.notification_intents import publish
from app.services.users import authorize


def can_view_all(context: RequestContext) -> bool:
    assert context.actor is not None
    return bool(set(context.actor.roles) & {"ADMIN", "AUDITOR"})


async def create_approval_in_uow(
    command: ApprovalCommand, context: RequestContext, uow: UnitOfWork
) -> dict[str, Any]:
    """Create an approval in a caller-owned transaction; never commits it."""
    assert context.actor is not None
    actor = context.actor
    validate_deadline(command.dueAt, datetime.now(UTC))
    approver_ids = tuple(step.approverId for step in command.steps)
    if len(set(approver_ids)) != len(approver_ids) or await uow.approvals.active_approver_count(
        approver_ids
    ) != len(approver_ids):
        fail("INVALID_APPROVER")
    if command.documentId and not await uow.approvals.entity_exists("Document", command.documentId):
        fail("REFERENCE_NOT_FOUND")
    if command.projectId and not await uow.approvals.entity_exists("Project", command.projectId):
        fail("REFERENCE_NOT_FOUND")
    if command.entityType or command.entityId:
        if (
            not command.entityType
            or not command.entityId
            or not await uow.approvals.entity_exists(command.entityType, command.entityId)
        ):
            fail("REFERENCE_NOT_FOUND")
    if command.documentId:
        state = await uow.approvals.document_status_for_update(command.documentId)
        if state is None:
            fail("REFERENCE_NOT_FOUND")
        if state == DocumentStatus.ARCHIVED.value:
            fail("INVALID_STATE")

    now = datetime.now(UTC).replace(tzinfo=None)
    result = await uow.approvals.create(
        {
            "title": command.title,
            "description": command.description or None,
            "entityType": command.entityType or None,
            "entityId": command.entityId or None,
            "documentId": command.documentId or None,
            "projectId": command.projectId or None,
            "requestedById": actor.actor_id,
            "status": ApprovalRequestStatus.PENDING,
            "currentStep": 1,
            "submittedAt": now,
            "dueAt": utc_naive(command.dueAt) if command.dueAt else None,
        },
        [
            {
                "sequence": index + 1,
                "name": step.name,
                "approverId": step.approverId,
                "status": ApprovalStepStatus.PENDING if index == 0 else ApprovalStepStatus.WAITING,
            }
            for index, step in enumerate(command.steps)
        ],
    )
    if command.documentId:
        await uow.approvals.set_document_status(command.documentId, DocumentStatus.IN_REVIEW.value)
    await uow.audit.append(
        AuditRecord(
            "APPROVAL_SUBMIT",
            "ApprovalRequest",
            result["id"],
            actor.actor_id,
            {"title": command.title, "stepCount": len(command.steps)},
            context.request_id,
        )
    )
    await publish(
        uow,
        (command.steps[0].approverId,),
        NotificationIntent(
            user_id=command.steps[0].approverId,
            event_type="APPROVAL_REQUESTED",
            channel="IN_APP",
            title="Новое согласование",
            body=command.title,
            dedupe_key=f"approval:{result['id']}:step:1",
            payload={
                "eventType": "APPROVAL_REQUESTED",
                "title": "Новое согласование",
                "body": command.title,
                "targetUrl": "/approvals",
            },
            target_url="/approvals",
            entity_type="ApprovalRequest",
            entity_id=result["id"],
        ),
        actor_id=actor.actor_id,
        request_id=context.request_id,
    )
    return result


async def decide_approval_in_uow(
    identifier: str,
    command: ApprovalDecisionCommand,
    context: RequestContext,
    uow: UnitOfWork,
) -> dict[str, Any]:
    """Apply an approval decision and its audit/notification in a caller-owned UoW."""
    assert context.actor is not None
    actor = context.actor
    request = await uow.approvals.get_for_update(identifier)
    if request is None:
        fail("NOT_FOUND")
    if request["status"] != ApprovalRequestStatus.PENDING.value:
        fail("INVALID_STATE")
    step = next(
        (
            item
            for item in request["steps"]
            if item["sequence"] == request["currentStep"]
            and item["status"] == ApprovalStepStatus.PENDING.value
        ),
        None,
    )
    if step is None:
        fail("INVALID_STATE")
    if step["approverId"] != actor.actor_id:
        fail("FORBIDDEN")
    now = datetime.now(UTC).replace(tzinfo=None)
    rejected = command.decision == "REJECT"
    status = ApprovalRequestStatus.REJECTED if rejected else ApprovalRequestStatus.PENDING
    next_step = (
        None
        if rejected
        else next(
            (item for item in request["steps"] if item["sequence"] == step["sequence"] + 1), None
        )
    )
    await uow.approvals.update_step(
        step["id"],
        {
            "status": ApprovalStepStatus.REJECTED if rejected else ApprovalStepStatus.APPROVED,
            "comment": command.comment or None,
            "decidedAt": now,
        },
    )
    next_approver_id = None
    if rejected:
        await uow.approvals.update_waiting_steps(identifier, ApprovalStepStatus.SKIPPED.value)
        await uow.approvals.update_request(
            identifier,
            {"status": status, "completedAt": now, "lockVersion": request["lockVersion"] + 1},
        )
        if request["documentId"]:
            await uow.approvals.set_document_status(
                request["documentId"], DocumentStatus.DRAFT.value
            )
    elif next_step:
        next_approver_id = next_step["approverId"]
        await uow.approvals.update_step(next_step["id"], {"status": ApprovalStepStatus.PENDING})
        await uow.approvals.update_request(
            identifier,
            {"currentStep": next_step["sequence"], "lockVersion": request["lockVersion"] + 1},
        )
    else:
        status = ApprovalRequestStatus.APPROVED
        await uow.approvals.update_request(
            identifier,
            {"status": status, "completedAt": now, "lockVersion": request["lockVersion"] + 1},
        )
        if request["documentId"]:
            await uow.approvals.set_document_status(
                request["documentId"], DocumentStatus.APPROVED.value
            )
    await uow.audit.append(
        AuditRecord(
            "APPROVAL_REJECT" if rejected else "APPROVAL_APPROVE",
            "ApprovalRequest",
            identifier,
            actor.actor_id,
            {"sequence": step["sequence"], "comment": command.comment or None},
            context.request_id,
        )
    )
    recipient = next_approver_id or request["requestedById"]
    event: Literal["APPROVAL_REQUESTED", "APPROVAL_DECIDED"] = (
        "APPROVAL_REQUESTED" if next_approver_id else "APPROVAL_DECIDED"
    )
    title = "Требуется согласование" if next_approver_id else "Согласование завершено"
    dedupe = (
        f"approval:{identifier}:step:{step['sequence'] + 1}"
        if next_approver_id
        else f"approval:{identifier}:result:{status.value}"
    )
    await publish(
        uow,
        (recipient,),
        NotificationIntent(
            user_id=recipient,
            event_type=event,
            channel="IN_APP",
            title=title,
            body=request["title"],
            dedupe_key=dedupe,
            payload={
                "eventType": event,
                "title": title,
                "body": request["title"],
                "targetUrl": "/approvals",
            },
            target_url="/approvals",
            entity_type="ApprovalRequest",
            entity_id=identifier,
        ),
        actor_id=actor.actor_id,
        request_id=context.request_id,
    )
    return {
        "requestId": identifier,
        "title": request["title"],
        "requestedById": request["requestedById"],
        "nextApproverId": next_approver_id,
        "nextSequence": step["sequence"] + 1,
        "status": status.value,
    }


class ApprovalService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def list_approvals(
        self, query: dict[str, Any], context: RequestContext
    ) -> tuple[list[dict[str, Any]], int]:
        assert context.actor is not None
        authorize(context.actor, "approvals.read")
        async with self._factory() as uow:
            return await uow.approvals.list_requests(
                context.actor.actor_id, can_view_all(context), query
            )

    async def get(self, identifier: str, context: RequestContext) -> dict[str, Any]:
        assert context.actor is not None
        authorize(context.actor, "approvals.read")
        async with self._factory() as uow:
            result = await uow.approvals.get_visible(
                identifier, context.actor.actor_id, can_view_all(context)
            )
            if result is None:
                fail("NOT_FOUND")
            return result

    async def approvers(self, context: RequestContext) -> list[dict[str, Any]]:
        assert context.actor is not None
        authorize(context.actor, "approvals.create")
        async with self._factory() as uow:
            return await uow.approvals.approvers()

    async def templates(self, context: RequestContext) -> list[dict[str, Any]]:
        assert context.actor is not None
        if context.actor.access is None or not (
            context.actor.access.has("approvals.create")
            or context.actor.access.has("approvals.templates.manage")
        ):
            raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
        async with self._factory() as uow:
            return await uow.approvals.templates(
                context.actor.access.has("approvals.templates.manage")
            )

    async def create_template(
        self, name: str, steps: list[dict[str, str]], context: RequestContext
    ) -> dict[str, Any]:
        assert context.actor is not None
        authorize(context.actor, "approvals.templates.manage")
        async with self._factory() as uow:
            if await uow.approvals.active_approver_count(
                tuple(step["approverId"] for step in steps)
            ) != len(steps):
                fail("INVALID_APPROVER")
            try:
                result = await uow.approvals.create_template(
                    {
                        "name": name,
                        "steps": steps,
                        "isActive": True,
                        "createdById": context.actor.actor_id,
                    }
                )
            except PersistenceConflict as error:
                if error.constraint == "approval_templates_name_key":
                    raise DomainError(
                        "APPROVAL_TEMPLATE_EXISTS",
                        "Шаблон с таким названием уже существует",
                        409,
                    ) from error
                raise
            await uow.audit.append(
                AuditRecord(
                    "APPROVAL_TEMPLATE_CREATE",
                    "ApprovalTemplate",
                    result["id"],
                    context.actor.actor_id,
                    {"name": name, "stepCount": len(steps)},
                    context.request_id,
                )
            )
            await uow.commit()
            return result

    async def update_template(
        self, identifier: str, values: dict[str, Any], context: RequestContext
    ) -> dict[str, Any]:
        assert context.actor is not None
        authorize(context.actor, "approvals.templates.manage")
        async with self._factory() as uow:
            if "steps" in values and await uow.approvals.active_approver_count(
                tuple(step["approverId"] for step in values["steps"])
            ) != len(values["steps"]):
                fail("INVALID_APPROVER")
            try:
                result = await uow.approvals.update_template(identifier, values)
            except PersistenceConflict as error:
                if error.constraint == "approval_templates_name_key":
                    raise DomainError(
                        "APPROVAL_TEMPLATE_EXISTS",
                        "Шаблон с таким названием уже существует",
                        409,
                    ) from error
                raise
            if result is None:
                fail("TEMPLATE_NOT_FOUND")
            await uow.audit.append(
                AuditRecord(
                    "APPROVAL_TEMPLATE_UPDATE",
                    "ApprovalTemplate",
                    identifier,
                    context.actor.actor_id,
                    {
                        "name": result["name"],
                        "isActive": result["isActive"],
                        **({"stepCount": len(values["steps"])} if "steps" in values else {}),
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return result

    async def create(self, command: ApprovalCommand, context: RequestContext) -> dict[str, Any]:
        assert context.actor is not None
        authorize(context.actor, "approvals.create")
        async with self._factory() as uow:
            result = await create_approval_in_uow(command, context, uow)
            await uow.commit()
            return result

    async def decide(
        self, identifier: str, command: ApprovalDecisionCommand, context: RequestContext
    ) -> dict[str, Any]:
        assert context.actor is not None
        actor = context.actor
        authorize(actor, "approvals.decide")
        async with self._factory() as uow:
            result = await decide_approval_in_uow(identifier, command, context, uow)
            await uow.commit()
        return result

    async def cancel(self, identifier: str, context: RequestContext) -> dict[str, Any]:
        assert context.actor is not None
        actor = context.actor
        authorize(actor, "approvals.cancel")
        async with self._factory() as uow:
            request = await uow.approvals.get_for_update(identifier)
            if request is None:
                fail("NOT_FOUND")
            if request["requestedById"] != actor.actor_id:
                fail("FORBIDDEN")
            if request["status"] not in (
                ApprovalRequestStatus.DRAFT.value,
                ApprovalRequestStatus.PENDING.value,
            ):
                fail("INVALID_STATE")
            now = datetime.now(UTC).replace(tzinfo=None)
            await uow.approvals.update_waiting_steps(identifier, ApprovalStepStatus.SKIPPED.value)
            await uow.approvals.update_step_many_pending(
                identifier, ApprovalStepStatus.SKIPPED.value
            )
            await uow.approvals.update_request(
                identifier,
                {
                    "status": ApprovalRequestStatus.CANCELLED,
                    "completedAt": now,
                    "lockVersion": request["lockVersion"] + 1,
                },
            )
            if request["documentId"]:
                await uow.approvals.set_document_status(
                    request["documentId"], DocumentStatus.DRAFT.value
                )
            await uow.audit.append(
                AuditRecord(
                    "APPROVAL_CANCEL",
                    "ApprovalRequest",
                    identifier,
                    actor.actor_id,
                    request_id=context.request_id,
                )
            )
            await uow.commit()
            return {
                "id": identifier,
                "title": request["title"],
                "requestedById": request["requestedById"],
                "documentId": request["documentId"],
                "status": request["status"],
            }
