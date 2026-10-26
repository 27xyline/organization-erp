from __future__ import annotations

from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, NoReturn

from app.core.context import RequestContext
from app.domain.auth.rules import AccessContext
from app.domain.enums import FinancePlanType
from app.domain.errors import DomainError
from app.domain.finance.finance_plan_rules import (
    calculate_budget_adjustments,
    normalize_allocations,
)
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.users import authorize

CENT = Decimal("0.01")
PLAN_TYPES = {"oklad": FinancePlanType.OKLAD, "nadbavka": FinancePlanType.NADBAVKA}
PLAN_LABELS = {FinancePlanType.OKLAD: "Оклад", FinancePlanType.NADBAVKA: "Надбавка"}
PROJECT_PAYROLL_ERRORS = {
    "PROJECT_NOT_FOUND": (404, "Проект не найден"),
    "PROJECT_MEMBER_NOT_FOUND": (404, "Сотрудник не найден в составе проекта"),
    "INVALID_NADBAVKA_AMOUNT": (400, "Введите корректную сумму надбавки"),
    "INVALID_OKLAD_AMOUNT": (400, "Для сотрудника не задан оклад в составе проекта"),
}
FINANCE_ERRORS = {
    "INVALID_EMPLOYEE_SELECTION": (400, "Employee is no longer available for planning"),
    "PROJECT_NOT_FOUND": (404, "Project not found"),
    "PROJECT_REQUIRED": (400, "Выберите проект"),
    "INVALID_OKLAD_AMOUNT": (400, "Для сотрудника не задан оклад"),
    "INVALID_FINANCE_AMOUNT": (400, "Введите сумму больше нуля"),
    "INVALID_ALLOCATIONS": (400, "Добавьте хотя бы одно начисление"),
}


def _fail(code: str, message: str | None = None, status: int | None = None) -> NoReturn:
    if message is None:
        status, message = FINANCE_ERRORS.get(
            code, (409, "Не удалось выполнить финансовую операцию")
        )
    raise DomainError(code, message, status or 409)


def _money(value: Decimal | int | float | str | None) -> Decimal:
    try:
        return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return Decimal("0.00")


def _fixed(value: Decimal | int | float | str | None) -> str:
    return format(_money(value), ".2f")


def _employee_in_scope(access: AccessContext, permission: str, employee: Any) -> bool:
    for grant in access.grants_for(permission):
        if grant.department_scope_mode == "ALL":
            return True
        if grant.department_scope_mode == "SELF" and employee.id == access.employee_id:
            return True
        if (
            grant.department_scope_mode == "ASSIGNED"
            and employee.departmentId in grant.department_ids
        ):
            return True
    return False


def _project_in_scope(access: AccessContext, permission: str, project_id: str) -> bool:
    return access.allows(permission, {"projectId": project_id})


def _authorize_any(actor: Any, *permissions: str) -> None:
    if not actor.is_authenticated or actor.access is None:
        _fail("UNAUTHENTICATED", "Требуется вход в систему", 401)
    if actor.must_change_password:
        _fail("PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403)
    if not any(actor.access.has(permission) for permission in permissions):
        _fail("FORBIDDEN", "Недостаточно прав", 403)


def _finance_in_scope(
    access: AccessContext, permission: str, employee: Any, project_id: str | None
) -> bool:
    return bool(project_id) and access.allows(
        permission,
        {"employeeId": employee.id, "departmentId": employee.departmentId, "projectId": project_id},
    )


def _project_budget(project: Any) -> dict[str, str]:
    planned = _money(project.plannedBudget)
    actual = _money(project.actualBudget)
    return {
        "id": project.id,
        "code": project.code,
        "name": project.name,
        "plannedBudget": _fixed(planned),
        "actualBudget": _fixed(actual),
        "remainingBudget": _fixed(planned - actual),
    }


def _allocation_cell(entries: list[Any]) -> dict[str, Any]:
    allocations = [
        {
            "projectId": entry.projectId,
            "projectCode": entry.project.code if entry.project else "",
            "projectName": entry.project.name if entry.project else "",
            "amount": _fixed(entry.amount),
        }
        for entry in entries
        if entry.projectId
    ]
    allocations.sort(key=lambda row: (row["projectCode"].casefold(), row["projectId"]))
    project_codes = list(
        dict.fromkeys(item["projectCode"] for item in allocations if item["projectCode"])
    )
    total = sum((_money(item["amount"]) for item in allocations), Decimal(0))
    single = allocations[0] if len(allocations) == 1 else None
    return {
        "amount": _fixed(total),
        "projectId": single["projectId"] if single else None,
        "projectCode": single["projectCode"] if single else "",
        "projectName": single["projectName"] if single else "",
        "projectLabel": ", ".join(project_codes),
        "allocations": allocations,
    }


def _project_payroll_cell(entries: list[Any]) -> dict[str, Any]:
    details = [
        {
            "type": str(entry.type),
            "typeLabel": PLAN_LABELS[FinancePlanType(str(entry.type))],
            "amount": _fixed(entry.amount),
        }
        for entry in entries
    ]
    details.sort(key=lambda row: row["typeLabel"].casefold())
    total = sum((_money(item["amount"]) for item in details), Decimal(0))
    return {
        "amount": _fixed(total),
        "projectId": None,
        "projectCode": "",
        "projectName": "",
        "projectLabel": "",
        "details": details,
    }


def _normalized_bonus(value: str | None) -> Decimal | None:
    if value is None or not value.strip():
        return None
    normalized = value.replace(",", ".").strip()
    if not __import__("re").fullmatch(r"\d+(?:\.\d{1,2})?", normalized):
        return None
    try:
        amount = Decimal(normalized).quantize(CENT, rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None
    return amount if amount > 0 else None


class FinanceService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def get_plan_table(
        self, plan_type: str, year: int, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "financePlans.read")
        if plan_type not in PLAN_TYPES:
            _fail("INVALID_FINANCE_PLAN_TYPE", "Invalid finance plan type", 400)
        access = actor.access
        async with self._factory() as uow:
            await uow.payroll_input_lock.lock_shared()
            employees = [
                employee
                for employee in await uow.finance.employees()
                if _employee_in_scope(access, "financePlans.read", employee)
            ]
            employee_ids = tuple(item.id for item in employees)
            entries = await uow.finance.plan_entries(
                year,
                plan_type=PLAN_TYPES[plan_type].value,
                employee_ids=employee_ids,
                project_only=True,
            )
            entries = [
                entry
                for entry in entries
                if _finance_in_scope(access, "financePlans.read", entry.employee, entry.projectId)
            ]
            groups: dict[tuple[str, int], list[Any]] = defaultdict(list)
            for entry in entries:
                groups[(entry.employeeId, entry.month)].append(entry)
            included_ids = tuple(
                dict.fromkeys(entry.projectId for entry in entries if entry.projectId)
            )
            projects = await uow.finance.projects_for_plan(included_ids)
            allowed_ids = access.allowed_project_ids("financePlans.read")
            projects = [
                project
                for project in projects
                if (allowed_ids is None or project.id in allowed_ids)
            ]
            rows = []
            for employee in employees:
                schedule = employee.staffSchedule
                months = {
                    str(month): _allocation_cell(groups.get((employee.id, month), []))
                    for month in range(1, 13)
                }
                rows.append(
                    {
                        "employeeId": employee.id,
                        "fullName": employee.fullName,
                        "department": schedule.department
                        if schedule
                        else employee.department or "—",
                        "position": schedule.position if schedule else "—",
                        "rate": _fixed(employee.employmentRate),
                        "salary": _fixed(
                            _money(schedule.salary) * Decimal(str(employee.employmentRate))
                        )
                        if schedule
                        else "0.00",
                        "months": months,
                    }
                )
            rows.sort(key=lambda row: (row["department"].casefold(), row["fullName"].casefold()))
            return {
                "year": year,
                "rows": rows,
                "projects": [_project_budget(item) for item in projects],
            }

    async def get_salary_table(self, year: int, context: RequestContext) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "finance.salary.read")
        access = actor.access
        async with self._factory() as uow:
            await uow.payroll_input_lock.lock_shared()
            employees = [
                employee
                for employee in await uow.finance.employees()
                if _employee_in_scope(access, "finance.salary.read", employee)
            ]
            entries = await uow.finance.plan_entries(
                year,
                employee_ids=tuple(item.id for item in employees),
                project_only=True,
            )
            entries = [
                entry
                for entry in entries
                if str(entry.type) in {"OKLAD", "NADBAVKA"}
                and _finance_in_scope(
                    access, "finance.salary.read", entry.employee, entry.projectId
                )
            ]
            grouped: dict[tuple[str, int], list[Any]] = defaultdict(list)
            for entry in entries:
                grouped[(entry.employeeId, entry.month)].append(entry)
            rows = []
            for employee in employees:
                schedule = employee.staffSchedule
                months = {}
                for month in range(1, 13):
                    values = grouped.get((employee.id, month), [])
                    project_codes = list(
                        dict.fromkeys(
                            entry.project.code
                            for entry in values
                            if entry.project and entry.project.code
                        )
                    )
                    months[str(month)] = {
                        "amount": _fixed(
                            sum((_money(entry.amount) for entry in values), Decimal(0))
                        ),
                        "projectId": None,
                        "projectCode": "",
                        "projectName": "",
                        "projectLabel": ", ".join(project_codes),
                        "details": [
                            {
                                "amount": _fixed(entry.amount),
                                "projectCode": entry.project.code if entry.project else "",
                                "typeLabel": "Оклад" if str(entry.type) == "OKLAD" else "Надбавка",
                            }
                            for entry in values
                        ],
                    }
                rows.append(
                    {
                        "employeeId": employee.id,
                        "fullName": employee.fullName,
                        "department": schedule.department
                        if schedule
                        else employee.department or "—",
                        "position": schedule.position if schedule else "—",
                        "rate": _fixed(employee.employmentRate),
                        "salary": _fixed(
                            _money(schedule.salary) * Decimal(str(employee.employmentRate))
                        )
                        if schedule
                        else "0.00",
                        "months": months,
                    }
                )
            rows.sort(key=lambda row: (row["department"].casefold(), row["fullName"].casefold()))
            return {"year": year, "rows": rows, "projects": []}

    async def save_plan(self, value: Any, context: RequestContext) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        _authorize_any(actor, "financePlans.create", "financePlans.update")
        access = actor.access
        type_value = PLAN_TYPES.get(value["type"])
        if type_value is None:
            _fail("INVALID_FINANCE_PLAN_TYPE", "Invalid finance plan type", 400)
        async with self._factory() as uow:
            await uow.payroll_periods.assert_open(value["year"], value["month"])
            employee = next(
                (row for row in await uow.finance.employees() if row.id == value["employeeId"]),
                None,
            )
            if employee is None:
                _fail("INVALID_EMPLOYEE_SELECTION")
            try:
                normalized = normalize_allocations(
                    type_value.value,
                    employee_salary=Decimal(str(employee.staffSchedule.salary))
                    if employee.staffSchedule
                    else Decimal(0),
                    employee_rate=Decimal(str(employee.employmentRate)),
                    project_id=value.get("projectId"),
                    allocations=tuple(
                        (item.get("projectId"), item.get("amount") or "")
                        for item in (value.get("allocations") or [])
                    ),
                )
            except ValueError as error:
                _fail(str(error))
            project_ids = tuple(dict.fromkeys(project_id for project_id, _ in normalized))
            projects = await uow.finance.projects(project_ids)
            if len(projects) != len(project_ids):
                _fail("PROJECT_NOT_FOUND")
            existing = await uow.finance.cell_entries(
                employee.id, value["year"], value["month"], type_value.value
            )
            permission = "financePlans.update" if existing else "financePlans.create"
            affected_ids = tuple(
                dict.fromkeys(
                    [*project_ids, *(entry.projectId for entry in existing if entry.projectId)]
                )
            )
            if not access.allows(
                permission,
                {
                    "employeeId": employee.id,
                    "departmentId": employee.departmentId,
                    "projectIds": affected_ids,
                },
            ):
                _fail("FORBIDDEN", "Недостаточно прав", 403)
            decrements, increments = calculate_budget_adjustments(
                [(entry.projectId, Decimal(str(entry.amount))) for entry in existing], normalized
            )
            created = await uow.finance.replace_cell(
                employee.id, value["year"], value["month"], type_value.value, normalized
            )
            await uow.finance.adjust_project_budgets(decrements, increments)
            updated_projects = await uow.finance.projects(project_ids)
            await uow.commit()
            return {
                "cell": _allocation_cell(created),
                "projects": [_project_budget(project) for project in updated_projects],
            }

    async def clear_plan(self, value: Any, context: RequestContext) -> None:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "financePlans.delete")
        type_value = PLAN_TYPES.get(value["type"])
        if type_value is None:
            _fail("INVALID_FINANCE_PLAN_TYPE", "Invalid finance plan type", 400)
        async with self._factory() as uow:
            await uow.payroll_periods.assert_open(value["year"], value["month"])
            existing = await uow.finance.cell_entries(
                value["employeeId"], value["year"], value["month"], type_value.value
            )
            if existing:
                employee = next(
                    (row for row in await uow.finance.employees() if row.id == value["employeeId"]),
                    None,
                )
                project_ids = tuple(
                    dict.fromkeys(entry.projectId for entry in existing if entry.projectId)
                )
                if employee is None or not actor.access.allows(
                    "financePlans.delete",
                    {
                        "employeeId": employee.id,
                        "departmentId": employee.departmentId,
                        "projectIds": project_ids,
                    },
                ):
                    _fail("FORBIDDEN", "Недостаточно прав", 403)
                decrements, increments = calculate_budget_adjustments(
                    [(entry.projectId, Decimal(str(entry.amount))) for entry in existing], []
                )
                await uow.finance.adjust_project_budgets(decrements, increments)
                await uow.finance.clear_cell(
                    value["employeeId"], value["year"], value["month"], type_value.value
                )
            await uow.commit()

    async def get_project_payroll(
        self, project_id: str, year: int, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "projectPayroll.read")
        if not _project_in_scope(actor.access, "projectPayroll.read", project_id):
            _fail("FORBIDDEN", "Недостаточно прав", 403)
        async with self._factory() as uow:
            await uow.payroll_input_lock.lock_shared()
            project = await uow.finance.project(project_id)
            if project is None:
                _fail("PROJECT_NOT_FOUND", "Проект не найден", 404)
            members = await uow.finance.project_payroll_members(project_id)
            entries = await uow.finance.plan_entries(
                year,
                employee_ids=tuple(member.employeeId for member in members),
                project_id=project_id,
            )
            entries = [entry for entry in entries if str(entry.type) in {"OKLAD", "NADBAVKA"}]
            grouped: dict[tuple[str, int], list[Any]] = defaultdict(list)
            for entry in entries:
                grouped[(entry.employeeId, entry.month)].append(entry)
            rows = []
            for member in members:
                rows.append(
                    {
                        "employeeId": member.employeeId,
                        "fullName": member.employee.fullName,
                        "department": member.department,
                        "position": member.position,
                        "rate": _fixed(member.rate),
                        "salary": _fixed(member.salary),
                        "months": {
                            str(month): _project_payroll_cell(
                                grouped.get((member.employeeId, month), [])
                            )
                            for month in range(1, 13)
                        },
                    }
                )
            summary = {
                "totalRate": _fixed(sum((Decimal(row["rate"]) for row in rows), Decimal(0))),
                "totalSalary": _fixed(sum((Decimal(row["salary"]) for row in rows), Decimal(0))),
                "monthTotals": {
                    str(month): _fixed(
                        sum(
                            (Decimal(row["months"][str(month)]["amount"]) for row in rows),
                            Decimal(0),
                        )
                    )
                    for month in range(1, 13)
                },
            }
            return {
                "year": year,
                "project": {"id": project.id, "code": project.code, "name": project.name},
                "rows": rows,
                "summary": summary,
            }

    async def save_project_payroll(
        self, project_id: str, value: Any, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        _authorize_any(actor, "projectPayroll.create", "projectPayroll.update")
        access = actor.access
        if not (
            access.allows("projectPayroll.create", {"projectId": project_id})
            or access.allows("projectPayroll.update", {"projectId": project_id})
        ):
            _fail("FORBIDDEN", "Недостаточно прав", 403)
        async with self._factory() as uow:
            await uow.payroll_periods.assert_open(value["year"], value["month"])
            member = await uow.finance.project_member(project_id, value["employeeId"])
            if member is None:
                _fail("PROJECT_MEMBER_NOT_FOUND", "Сотрудник не найден в составе проекта", 404)
            project = await uow.finance.project(project_id)
            if project is None:
                _fail("PROJECT_NOT_FOUND", "Проект не найден", 404)
            next_entries: list[tuple[str, Decimal]] = []
            if value["okladEnabled"]:
                salary = _money(member.salary)
                if salary <= 0:
                    _fail(
                        "INVALID_OKLAD_AMOUNT",
                        "Для сотрудника не задан оклад в составе проекта",
                        400,
                    )
                next_entries.append((FinancePlanType.OKLAD.value, salary))
            bonus = _normalized_bonus(value.get("nadbavkaAmount"))
            if value.get("nadbavkaAmount") and value["nadbavkaAmount"].strip() and bonus is None:
                _fail("INVALID_NADBAVKA_AMOUNT", "Введите корректную сумму надбавки", 400)
            if bonus is not None:
                next_entries.append((FinancePlanType.NADBAVKA.value, bonus))
            existing = await uow.finance.cell_entries(
                value["employeeId"],
                value["year"],
                value["month"],
                FinancePlanType.OKLAD.value,
                project_scope=project_id,
            )
            existing.extend(
                await uow.finance.cell_entries(
                    value["employeeId"],
                    value["year"],
                    value["month"],
                    FinancePlanType.NADBAVKA.value,
                    project_scope=project_id,
                )
            )
            permission = "projectPayroll.update" if existing else "projectPayroll.create"
            if not access.allows(permission, {"projectId": project_id}):
                _fail("FORBIDDEN", "Недостаточно прав", 403)
            decrements, increments = calculate_budget_adjustments(
                [(entry.projectId, Decimal(str(entry.amount))) for entry in existing],
                [(project_id, amount) for _, amount in next_entries],
            )
            for plan_type in (FinancePlanType.OKLAD.value, FinancePlanType.NADBAVKA.value):
                await uow.finance.clear_cell(
                    value["employeeId"],
                    value["year"],
                    value["month"],
                    plan_type,
                    project_scope=project_id,
                )
            created = []
            for plan_type, amount in next_entries:
                created.extend(
                    await uow.finance.replace_cell(
                        value["employeeId"],
                        value["year"],
                        value["month"],
                        plan_type,
                        ((project_id, amount),),
                        project_scope=project_id,
                    )
                )
            await uow.finance.adjust_project_budgets(decrements, increments)
            await uow.commit()
            return {"cell": _project_payroll_cell(created)}

    async def clear_project_payroll(
        self, project_id: str, value: Any, context: RequestContext
    ) -> None:
        actor = context.actor
        assert actor is not None and actor.access is not None
        authorize(actor, "projectPayroll.delete")
        if not actor.access.allows("projectPayroll.delete", {"projectId": project_id}):
            _fail("FORBIDDEN", "Недостаточно прав", 403)
        async with self._factory() as uow:
            await uow.payroll_periods.assert_open(value["year"], value["month"])
            existing: list[Any] = []
            for plan_type in (FinancePlanType.OKLAD.value, FinancePlanType.NADBAVKA.value):
                existing.extend(
                    entry
                    for entry in await uow.finance.cell_entries(
                        value["employeeId"],
                        value["year"],
                        value["month"],
                        plan_type,
                        project_scope=project_id,
                    )
                )
                await uow.finance.clear_cell(
                    value["employeeId"],
                    value["year"],
                    value["month"],
                    plan_type,
                    project_scope=project_id,
                )
            decrements, increments = calculate_budget_adjustments(
                [(entry.projectId, Decimal(str(entry.amount))) for entry in existing], []
            )
            await uow.finance.adjust_project_budgets(decrements, increments)
            await uow.commit()
