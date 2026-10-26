"Снимки состава проекта; прежняя реализация не создаёт записей аудита и уведомлений."

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from decimal import Decimal
from typing import Any

from app.core.context import Actor, RequestContext
from app.domain.employees.employment import fixed_money
from app.domain.errors import DomainError
from app.domain.ports.employees import ProjectEmployeeReference
from app.domain.ports.projects import MemberRecord
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.employees import EmployeeReferenceQuery
from app.services.employees import EmployeeService, authorize
from app.services.projects import lock_project, project_error


@dataclass(frozen=True, slots=True)
class ProjectMembers:
    members: tuple[MemberRecord, ...]
    available_employees: tuple[ProjectEmployeeReference, ...]

    @property
    def values(self) -> dict[str, Any]:
        return {
            "members": [item.values for item in self.members],
            "availableEmployees": [asdict(item) for item in self.available_employees],
        }


def visible_member(member: MemberRecord, actor: Actor, project_id: str) -> MemberRecord:
    assert actor.access is not None
    if actor.access.allows("projectPayroll.read", {"projectId": project_id}):
        return member
    employee = member.employee.copy()
    staff = employee["staffSchedule"]
    if staff is not None:
        employee["staffSchedule"] = {**staff, "salary": ""}
    return replace(member, salary="", employee=employee)


class ProjectMemberService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def list(self, project_id: str, actor: Actor) -> ProjectMembers:
        authorize(actor, "projectMembers.read", {"projectId": project_id})
        assert actor.access is not None
        async with self._factory() as uow:
            if await uow.projects.get(project_id) is None:
                raise project_error()
            members = await uow.projects.members(
                project_id, actor.access.allows("projectPayroll.read", {"projectId": project_id})
            )
        available: list[ProjectEmployeeReference] = []
        if actor.access.allows("projectMembers.create", {"projectId": project_id}):
            available = await EmployeeService(self._factory).project_references(
                EmployeeReferenceQuery(project_id), actor
            )
        return ProjectMembers(members, tuple(available))

    async def add(self, project_id: str, employee_id: str, context: RequestContext) -> MemberRecord:
        actor = context.actor
        assert actor is not None
        authorize(actor, "projectMembers.create", {"projectId": project_id})
        async with self._factory() as uow:
            await uow.payroll_input_lock.lock_shared()
            await lock_project(uow, project_id, actor)
            employee = await uow.employees.get(employee_id)
            if employee is None:
                raise DomainError("EMPLOYEE_NOT_FOUND", "Сотрудник не найден", 404)
            if employee.status == "DISMISSED":
                raise DomainError(
                    "EMPLOYEE_DISMISSED", "Нельзя добавить уволенного сотрудника", 400
                )
            staff = employee.staffSchedule
            values = dict(
                department=(staff.department if staff else employee.department) or "—",
                position=(staff.position if staff else "") or "—",
                rate=Decimal(fixed_money(float(employee.employmentRate))),
                salary=Decimal(
                    fixed_money(
                        float(staff.salary if staff else 0) * float(employee.employmentRate)
                    )
                ),
                isArchived=False,
                archivedAt=None,
            )
            result = await uow.projects.add_member(project_id, employee_id, values)
            await uow.commit()
            return visible_member(result, actor, project_id)

    async def update(
        self, project_id: str, member_id: str, archived: bool, context: RequestContext
    ) -> MemberRecord:
        actor = context.actor
        assert actor is not None
        authorize(actor, "projectMembers.update", {"projectId": project_id})
        async with self._factory() as uow:
            await lock_project(uow, project_id, actor)
            result = await uow.projects.update_member(project_id, member_id, archived)
            if result is None:
                raise DomainError("PROJECT_MEMBER_NOT_FOUND", "Участник проекта не найден", 404)
            await uow.commit()
            return visible_member(result, actor, project_id)
