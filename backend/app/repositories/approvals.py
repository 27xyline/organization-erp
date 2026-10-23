"""SQLAlchemy approval queries and transactional state changes."""

from collections.abc import Callable
from typing import Any

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import PersistenceConflict
from app.models.approvals import ApprovalRequest, ApprovalStep, ApprovalTemplate
from app.models.documents import Document
from app.models.enums import ApprovalRequestStatus, ApprovalStepStatus, DocumentStatus
from app.models.procurement import ProcurementRequest
from app.models.projects import Project
from app.models.timekeeping import TimeEntry, Timesheet
from app.models.users import User


def _constraint_name(error: IntegrityError) -> str:
    original: Any = error.orig
    visited: set[int] = set()
    while original is not None and id(original) not in visited:
        visited.add(id(original))
        name = getattr(original, "constraint_name", None)
        if name:
            return str(name)
        diagnostic = getattr(original, "diag", None)
        name = getattr(diagnostic, "constraint_name", None)
        if name:
            return str(name)
        original = getattr(original, "orig", None) or getattr(original, "__cause__", None)
    return ""


async def _flush(session: AsyncSession) -> None:
    try:
        await session.flush()
    except IntegrityError as error:
        raise PersistenceConflict(_constraint_name(error)) from error


class SqlAlchemyApprovalRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def _record(self, request: ApprovalRequest, *, lock: bool = False) -> dict[str, Any]:
        session = self._session()
        requester = await session.get(User, request.requestedById)
        document = await session.get(Document, request.documentId) if request.documentId else None
        project = await session.get(Project, request.projectId) if request.projectId else None
        steps = (
            await session.scalars(
                select(ApprovalStep)
                .where(ApprovalStep.requestId == request.id)
                .order_by(ApprovalStep.sequence.asc())
                .with_for_update()
                if lock
                else select(ApprovalStep)
                .where(ApprovalStep.requestId == request.id)
                .order_by(ApprovalStep.sequence.asc())
            )
        ).all()
        approver_ids = [step.approverId for step in steps]
        approvers = (
            {
                user.id: user
                for user in (
                    await session.scalars(select(User).where(User.id.in_(approver_ids)))
                ).all()
            }
            if approver_ids
            else {}
        )
        return {
            "id": request.id,
            "title": request.title,
            "description": request.description,
            "entityType": request.entityType,
            "entityId": request.entityId,
            "status": request.status.value,
            "currentStep": request.currentStep,
            "dueAt": request.dueAt,
            "submittedAt": request.submittedAt,
            "completedAt": request.completedAt,
            "lockVersion": request.lockVersion,
            "requestedById": request.requestedById,
            "requestedBy": {"id": requester.id, "name": requester.name} if requester else None,
            "documentId": request.documentId,
            "document": {
                "id": document.id,
                "title": document.title,
                "status": document.status.value,
            }
            if document
            else None,
            "projectId": request.projectId,
            "project": {"id": project.id, "code": project.code, "name": project.name}
            if project
            else None,
            "createdAt": request.createdAt,
            "updatedAt": request.updatedAt,
            "steps": [
                {
                    "id": step.id,
                    "sequence": step.sequence,
                    "name": step.name,
                    "status": step.status.value,
                    "comment": step.comment,
                    "approverId": step.approverId,
                    "approver": {
                        "id": approvers[step.approverId].id,
                        "name": approvers[step.approverId].name,
                    }
                    if step.approverId in approvers
                    else None,
                }
                for step in steps
            ],
        }

    async def list_requests(
        self, user_id: str, can_view_all: bool, query: dict[str, Any]
    ) -> tuple[list[dict[str, Any]], int]:
        session = self._session()
        predicates: list[Any] = []
        if query.get("status"):
            predicates.append(ApprovalRequest.status == ApprovalRequestStatus(query["status"]))
        if query.get("search"):
            predicates.append(
                or_(
                    ApprovalRequest.title.ilike(f"%{query['search']}%"),
                    ApprovalRequest.description.ilike(f"%{query['search']}%"),
                )
            )
        assigned = select(ApprovalStep.requestId).where(ApprovalStep.approverId == user_id)
        if query.get("assignedToMe"):
            predicates.append(ApprovalRequest.id.in_(assigned))
        elif not can_view_all:
            predicates.append(
                or_(ApprovalRequest.requestedById == user_id, ApprovalRequest.id.in_(assigned))
            )
        count = (
            await session.scalar(
                select(func.count()).select_from(ApprovalRequest).where(*predicates)
            )
            or 0
        )
        requests = (
            await session.scalars(
                select(ApprovalRequest)
                .where(*predicates)
                .order_by(ApprovalRequest.updatedAt.desc(), ApprovalRequest.id.desc())
                .offset((query["page"] - 1) * query["pageSize"])
                .limit(query["pageSize"])
            )
        ).all()
        return [await self._record(item) for item in requests], int(count)

    async def get_visible(
        self, identifier: str, user_id: str, can_view_all: bool
    ) -> dict[str, Any] | None:
        session = self._session()
        request = await session.get(ApprovalRequest, identifier)
        if request is None:
            return None
        if not can_view_all and request.requestedById != user_id:
            assigned = await session.scalar(
                select(ApprovalStep.id)
                .where(ApprovalStep.requestId == identifier, ApprovalStep.approverId == user_id)
                .limit(1)
            )
            if assigned is None:
                return None
        return await self._record(request)

    async def pending_for_user(self, user_id: str, limit: int) -> tuple[list[dict[str, Any]], int]:
        session = self._session()
        where = (
            select(ApprovalRequest.id)
            .join(ApprovalStep)
            .where(
                ApprovalRequest.status == ApprovalRequestStatus.PENDING,
                ApprovalStep.approverId == user_id,
                ApprovalStep.status == ApprovalStepStatus.PENDING,
                ApprovalStep.sequence == ApprovalRequest.currentStep,
            )
        )
        total = await session.scalar(select(func.count()).select_from(where.subquery())) or 0
        requests = (
            await session.scalars(
                select(ApprovalRequest)
                .where(ApprovalRequest.id.in_(where))
                .order_by(
                    ApprovalRequest.dueAt.asc().nulls_last(), ApprovalRequest.updatedAt.desc()
                )
                .limit(limit)
            )
        ).all()
        records = []
        for request in requests:
            record = await self._record(request)
            step = next((s for s in record["steps"] if s["sequence"] == request.currentStep), None)
            if step:
                records.append(
                    {
                        "id": request.id,
                        "title": request.title,
                        "dueAt": request.dueAt,
                        "requestedBy": record["requestedBy"],
                        "step": {"sequence": step["sequence"], "name": step["name"]},
                    }
                )
        return records, int(total)

    async def approvers(self) -> list[dict[str, Any]]:
        users = (
            await self._session().scalars(
                select(User).where(User.isActive.is_(True)).order_by(User.name.asc(), User.id.asc())
            )
        ).all()
        return [{"id": user.id, "name": user.name, "username": user.username} for user in users]

    async def templates(self, include_inactive: bool) -> list[dict[str, Any]]:
        query = select(ApprovalTemplate)
        if not include_inactive:
            query = query.where(ApprovalTemplate.isActive.is_(True))
        templates = (
            await self._session().scalars(
                query.order_by(ApprovalTemplate.name.asc(), ApprovalTemplate.id.asc())
            )
        ).all()
        return [
            {"id": item.id, "name": item.name, "steps": item.steps, "isActive": item.isActive}
            for item in templates
        ]

    async def active_approver_count(self, ids: tuple[str, ...]) -> int:
        if not ids:
            return 0
        return int(
            await self._session().scalar(
                select(func.count(User.id)).where(User.id.in_(ids), User.isActive.is_(True))
            )
            or 0
        )

    async def create_template(self, values: dict[str, Any]) -> dict[str, Any]:
        row = ApprovalTemplate(**values)
        self._session().add(row)
        await _flush(self._session())
        return {"id": row.id, "name": row.name, "steps": row.steps, "isActive": row.isActive}

    async def update_template(
        self, identifier: str, values: dict[str, Any]
    ) -> dict[str, Any] | None:
        row = await self._session().get(ApprovalTemplate, identifier, with_for_update=True)
        if row is None:
            return None
        for key, value in values.items():
            setattr(row, key, value)
        await _flush(self._session())
        return {"id": row.id, "name": row.name, "steps": row.steps, "isActive": row.isActive}

    async def entity_exists(self, entity_type: str, entity_id: str) -> bool:
        models: dict[str, Any] = {
            "Document": Document,
            "Project": Project,
            "ProcurementRequest": ProcurementRequest,
            "Timesheet": Timesheet,
            "TimeEntry": TimeEntry,
        }
        model = models.get(entity_type)
        if model is None:
            return False
        return (
            await self._session().scalar(select(model.id).where(model.id == entity_id).limit(1))
            is not None
        )

    async def create(self, values: dict[str, Any], steps: list[dict[str, Any]]) -> dict[str, Any]:
        request = ApprovalRequest(**values)
        self._session().add(request)
        await self._session().flush()
        for step in steps:
            self._session().add(ApprovalStep(requestId=request.id, **step))
        await self._session().flush()
        return await self._record(request)

    async def get_for_update(self, identifier: str) -> dict[str, Any] | None:
        request = await self._session().scalar(
            select(ApprovalRequest).where(ApprovalRequest.id == identifier).with_for_update()
        )
        return await self._record(request, lock=True) if request else None

    async def get_for_entity(self, entity_type: str, entity_id: str) -> dict[str, Any] | None:
        request = await self._session().scalar(
            select(ApprovalRequest).where(
                ApprovalRequest.entityType == entity_type,
                ApprovalRequest.entityId == entity_id,
            )
        )
        return await self._record(request) if request else None

    async def get_pending_for_entity(
        self, entity_type: str, entity_id: str
    ) -> dict[str, Any] | None:
        result = await self._session().execute(
            select(ApprovalRequest).where(
                ApprovalRequest.entityType == entity_type,
                ApprovalRequest.entityId == entity_id,
                ApprovalRequest.status == ApprovalRequestStatus.PENDING,
            )
        )
        request = result.scalar_one_or_none()
        return await self._record(request) if request else None

    async def update_step(self, identifier: str, values: dict[str, Any]) -> None:
        await self._session().execute(
            update(ApprovalStep).where(ApprovalStep.id == identifier).values(**values)
        )

    async def update_waiting_steps(self, request_id: str, status: str) -> None:
        await self._session().execute(
            update(ApprovalStep)
            .where(
                ApprovalStep.requestId == request_id,
                ApprovalStep.status == ApprovalStepStatus.WAITING,
            )
            .values(status=ApprovalStepStatus(status))
        )

    async def update_step_many_pending(self, request_id: str, status: str) -> None:
        await self._session().execute(
            update(ApprovalStep)
            .where(
                ApprovalStep.requestId == request_id,
                ApprovalStep.status == ApprovalStepStatus.PENDING,
            )
            .values(status=ApprovalStepStatus(status))
        )

    async def update_request(self, identifier: str, values: dict[str, Any]) -> None:
        await self._session().execute(
            update(ApprovalRequest).where(ApprovalRequest.id == identifier).values(**values)
        )

    async def cancel(self, identifier: str, values: dict[str, Any]) -> dict[str, Any] | None:
        request = await self._session().get(ApprovalRequest, identifier)
        if request is None:
            return None
        return {
            "id": request.id,
            "title": request.title,
            "requestedById": request.requestedById,
            "documentId": request.documentId,
            "status": request.status.value,
            **values,
        }

    async def set_document_status(self, identifier: str, status: str) -> None:
        await self._session().execute(
            update(Document)
            .where(Document.id == identifier)
            .values(status=DocumentStatus(status), lockVersion=Document.lockVersion + 1)
        )

    async def document_status_for_update(self, identifier: str) -> str | None:
        result = await self._session().scalar(
            select(Document.status).where(Document.id == identifier).with_for_update()
        )
        return result.value if result is not None else None
