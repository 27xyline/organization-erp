"Сценарии проектов и граница аудита в одной транзакции."

from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.context import Actor, RequestContext
from app.domain.errors import DomainError, PersistenceConflict
from app.domain.ports.projects import ProjectPage, ProjectRecord
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.departments import _check_actor
from app.services.dto.projects import ProjectCommand, ProjectListQuery
from app.services.employees import audit, authorize


def project_error() -> DomainError:
    return DomainError("PROJECT_NOT_FOUND", "Проект не найден", 404)


def parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.astimezone(UTC).replace(tzinfo=None) if result.tzinfo else result
    except ValueError:
        raise DomainError("internal_error", "An unexpected error occurred", 500) from None


async def check_actor(uow: UnitOfWork, actor: Actor) -> None:
    await _check_actor(uow, actor)
    current = await uow.users.get(actor.actor_id)
    if current is not None and current.must_change_password:
        raise DomainError("PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403)


async def lock_project(uow: UnitOfWork, identifier: str, actor: Actor) -> None:
    # UserService задаёт порядок пользователь -> проект: вставки внешнего ключа
    # берут KEY SHARE проекта после блокировки пользователя. Операции изменения графа и участников
    # затем последовательно блокируют строку проекта перед проверкой состояния графа.
    await check_actor(uow, actor)
    if not await uow.projects.lock(identifier):
        raise project_error()


TEMPLATES = {
    "RESEARCH": (
        ("Подготовка программы исследования", 0, 10, "HIGH", "MEDIUM"),
        ("Проведение эксперимента", 10, 20, "HIGH", "HIGH"),
        ("Анализ результатов", 30, 10, "MEDIUM", "MEDIUM"),
        ("Утверждение итогового отчёта", 40, 0, "CRITICAL", "LOW"),
    ),
    "PROCUREMENT": (
        ("Подготовка технического задания", 0, 7, "HIGH", "MEDIUM"),
        ("Выбор поставщика", 7, 14, "HIGH", "HIGH"),
        ("Поставка и входной контроль", 21, 21, "MEDIUM", "HIGH"),
        ("Ввод в эксплуатацию", 42, 0, "CRITICAL", "LOW"),
    ),
}


class ProjectService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def list(
        self, query: ProjectListQuery, actor: Actor, *, references: bool = False
    ) -> ProjectPage:
        permission = (
            "projects.reference.read"
            if references and actor.access and actor.access.has("projects.reference.read")
            else "projects.read"
        )
        authorize(actor, permission)
        assert actor.access is not None
        async with self._factory() as uow:
            result = await uow.projects.list(
                query.page,
                query.page_size,
                query.status,
                None
                if permission == "projects.reference.read"
                else actor.access.allowed_project_ids(permission),
                references and permission == "projects.reference.read",
            )
            if not references:
                for item in result.projects:
                    for permission, field in [
                        ("tasks.read", "tasksList"),
                        ("assets.read", "assets"),
                    ]:
                        if not actor.access.allows(permission, {"projectId": item.id}):
                            assert item.counts is not None
                            item.counts[field] = 0
            return result

    async def get(self, identifier: str, actor: Actor, *, detail: bool = False) -> ProjectRecord:
        authorize(actor, "projects.read", {"projectId": identifier})
        assert actor.access is not None
        async with self._factory() as uow:
            result = await uow.projects.project_view(identifier, actor.access, detail)
            if result is None:
                raise project_error()
            return result

    async def create(self, command: ProjectCommand, context: RequestContext) -> ProjectRecord:
        actor = context.actor
        assert actor is not None
        authorize(actor, "projects.create")
        data = self._data(command)
        async with self._factory() as uow:
            await check_actor(uow, actor)
            try:
                result = await uow.projects.create(data)
                if command.templateId:
                    base = parse_date(command.startDate) or datetime.now()
                    previous: str | None = None
                    for name, offset, duration, priority, risk in TEMPLATES[command.templateId]:
                        start = base + timedelta(days=offset)
                        task = await uow.projects.create_task(
                            result.id,
                            dict(
                                name=name,
                                level=1,
                                startDate=start,
                                endDate=start + timedelta(days=duration),
                                duration=duration,
                                isMilestone=duration == 0,
                                priority=priority,
                                risk=risk,
                                predecessorIds=[previous] if previous else [],
                            ),
                            (),
                        )
                        previous = task.id
                assert actor.access is not None
                await uow.projects.assign_scopes(
                    result.id,
                    tuple(
                        grant.assignment_id
                        for grant in actor.access.grants_for("projects.create")
                        if grant.project_scope_mode == "ASSIGNED"
                    ),
                )
                await audit(
                    uow,
                    context,
                    "PROJECT_CREATE",
                    "Project",
                    result.id,
                    {"after": self._summary(result)},
                )
                await uow.commit()
                return result
            except PersistenceConflict as error:
                if error.constraint == "projects_code_key":
                    raise DomainError(
                        "PROJECT_CODE_EXISTS", "Проект с таким кодом уже существует", 409
                    ) from error
                raise

    async def update(
        self, identifier: str, command: ProjectCommand, context: RequestContext
    ) -> ProjectRecord:
        actor = context.actor
        assert actor is not None
        authorize(actor, "projects.update", {"projectId": identifier})
        async with self._factory() as uow:
            await lock_project(uow, identifier, actor)
            before = await uow.projects.get(identifier)
            assert before is not None
            try:
                result = await uow.projects.update(identifier, self._data(command))
            except PersistenceConflict as error:
                if error.constraint == "projects_code_key":
                    raise DomainError(
                        "internal_error", "An unexpected error occurred", 500
                    ) from error
                raise
            await audit(
                uow,
                context,
                "PROJECT_UPDATE",
                "Project",
                identifier,
                {"before": self._summary(before), "after": self._summary(result)},
            )
            await uow.commit()
            return result

    async def delete(self, identifier: str, context: RequestContext) -> dict[str, bool]:
        actor = context.actor
        assert actor is not None
        authorize(actor, "projects.delete", {"projectId": identifier})
        async with self._factory() as uow:
            await lock_project(uow, identifier, actor)
            before = await uow.projects.get(identifier)
            assert before is not None
            await uow.projects.delete(identifier)
            await audit(
                uow,
                context,
                "PROJECT_DELETE",
                "Project",
                identifier,
                {"before": {key: before.values[key] for key in ("code", "name")}},
            )
            await uow.commit()
            return {"success": True}

    @staticmethod
    def _data(command: ProjectCommand) -> dict[str, Any]:
        values = asdict(command)
        values.pop("templateId")
        for key in ("description", "goals", "tasks", "results"):
            values[key] = values[key] or None
        values["startDate"] = parse_date(command.startDate)
        values["endDate"] = parse_date(command.endDate)
        return values

    @staticmethod
    def _summary(project: ProjectRecord) -> dict[str, Any]:
        return {key: project.values[key] for key in ("code", "name", "status")}
