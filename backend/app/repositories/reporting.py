"""Scoped SQL projections for dashboards and reports; ORM rows stay repository-local."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, case, exists, false, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth.rules import AccessContext
from app.models.approvals import ApprovalRequest, ApprovalStep
from app.models.assets import Asset, AssetHolding, AssetInventory, AssetInventoryEntry, Operation
from app.models.catalogs import Mol
from app.models.departments import Department
from app.models.employees import Employee
from app.models.finance import FinancePlanEntry, PersonnelAction, SalaryEntry
from app.models.projects import Project, ProjectMember, Task, TaskAssignee
from app.models.timekeeping import StaffSchedule, Vacation
from app.models.users import AuditLog, User
from app.repositories.assets import visibility as asset_visibility
from app.repositories.employees import employee_scope


def _id_scope(access: AccessContext, permission: str, column: Any) -> Any:
    predicates = []
    for grant in access.grants_for(permission):
        ids = access._ids(grant, "project")
        predicates.append(true() if ids is None else column.in_(ids))
    return or_(*predicates) if predicates else false()


def project_scope(access: AccessContext, permission: str) -> Any:
    clauses = []
    for grant in access.grants_for(permission):
        ids = access._ids(grant, "project")
        clauses.append(true() if ids is None else Project.id.in_(ids))
    return or_(*clauses) if clauses else false()


def department_scope(access: AccessContext, permission: str) -> Any:
    clauses = []
    for grant in access.grants_for(permission):
        ids = access._ids(grant, "department")
        clauses.append(true() if ids is None else Department.id.in_(ids))
    return or_(*clauses) if clauses else false()


def _employee_permission(access: AccessContext) -> str | None:
    if access.has("employees.read"):
        return "employees.read"
    if access.has("finance.salary.read"):
        return "finance.salary.read"
    return None


def _dashboard_employee_columns(*, can_finance: bool) -> list[Any]:
    columns = [
        Employee.id,
        Employee.code,
        Employee.fullName,
        Employee.departmentId,
        Employee.department,
        Employee.status,
        Employee.employmentRate,
        Employee.contractEndDate,
        StaffSchedule.position,
    ]
    if can_finance:
        columns.append(StaffSchedule.salary)
    return columns


class SqlAlchemyReportingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def dashboard(
        self, query: dict[str, str | None], access: AccessContext, now: datetime
    ) -> dict[str, Any]:
        date_from = datetime.fromisoformat(str(query["dateFrom"]) + "T00:00:00")
        date_to = datetime.fromisoformat(str(query["dateTo"]) + "T23:59:59.999000")
        today = datetime.combine(now.date(), datetime.min.time())
        today_end = datetime.combine(now.date(), datetime.max.time()).replace(microsecond=999000)
        horizon = today + timedelta(days=90)
        emp_permission = _employee_permission(access)
        can_employees = emp_permission is not None
        can_projects = access.has("projects.read")
        can_tasks = access.has("tasks.read")
        can_assets = access.has("assets.read")
        can_finance = access.has("finance.salary.read") or access.has("payroll.read")
        department_id, project_id = query.get("departmentId"), query.get("projectId")

        departments: list[dict[str, Any]] = []
        if access.has("departments.read"):
            department_rows = (
                await self.session.execute(
                    select(Department.id, Department.code, Department.name)
                    .where(
                        Department.isActive.is_(True), department_scope(access, "departments.read")
                    )
                    .order_by(Department.name)
                )
            ).all()
            departments = [{"id": r.id, "code": r.code, "name": r.name} for r in department_rows]

        projects: list[dict[str, Any]] = []
        project_options: list[dict[str, Any]] = []
        if can_projects:
            project_filter = project_scope(access, "projects.read")
            option_rows = (
                await self.session.execute(
                    select(Project.id, Project.code, Project.name)
                    .where(project_filter)
                    .order_by(Project.name)
                )
            ).all()
            project_options = [{"id": r.id, "code": r.code, "name": r.name} for r in option_rows]
            active_filter = [
                project_filter,
                Project.status == "ACTIVE",
                or_(Project.startDate.is_(None), Project.startDate <= date_to),
                or_(Project.endDate.is_(None), Project.endDate >= date_from),
            ]
            if project_id:
                active_filter.append(Project.id == project_id)
            if department_id:
                active_filter.append(
                    exists(
                        select(ProjectMember.id)
                        .join(Employee, Employee.id == ProjectMember.employeeId)
                        .where(
                            ProjectMember.projectId == Project.id,
                            Employee.departmentId == department_id,
                        )
                    )
                )
            project_rows = (
                await self.session.execute(
                    select(
                        Project.id,
                        Project.code,
                        Project.name,
                        Project.startDate,
                        Project.endDate,
                        Project.plannedBudget,
                        Project.actualBudget,
                    )
                    .where(*active_filter)
                    .order_by(Project.endDate, Project.name)
                )
            ).all()
            project_ids = [r.id for r in project_rows]
            task_counts: dict[str, tuple[int, int, int]] = {}
            if can_tasks and project_ids:
                count_rows = (
                    await self.session.execute(
                        select(
                            Task.projectId,
                            func.count(Task.id),
                            func.sum(case((Task.status == "COMPLETED", 1), else_=0)),
                            func.avg(Task.progress),
                        )
                        .where(Task.projectId.in_(project_ids))
                        .group_by(Task.projectId)
                    )
                ).all()
                task_counts = {
                    r[0]: (int(r[1] or 0), int(r[2] or 0), int(round(float(r[3] or 0))))
                    for r in count_rows
                }
            for r in project_rows:
                count, completed, progress = task_counts.get(r.id, (0, 0, 0))
                projects.append(
                    {
                        "id": r.id,
                        "code": r.code,
                        "name": r.name,
                        "startDate": r.startDate,
                        "endDate": r.endDate,
                        "plannedBudget": float(r.plannedBudget),
                        "actualBudget": float(r.actualBudget),
                        "progress": progress,
                        "tasksTotal": count,
                        "tasksCompleted": completed,
                    }
                )

        employees: list[dict[str, Any]] = []
        if can_employees and emp_permission:
            employee_filter = [
                employee_scope(access, emp_permission),
                Employee.status != "DISMISSED",
            ]
            if department_id:
                employee_filter.append(Employee.departmentId == department_id)
            employee_rows = (
                await self.session.execute(
                    select(*_dashboard_employee_columns(can_finance=can_finance))
                    .outerjoin(StaffSchedule, StaffSchedule.id == Employee.staffScheduleId)
                    .where(*employee_filter)
                    .order_by(Employee.fullName)
                )
            ).all()
            employees = []
            for r in employee_rows:
                employee: dict[str, Any] = {
                    "id": r.id,
                    "code": r.code,
                    "fullName": r.fullName,
                    "departmentId": r.departmentId,
                    "department": r.department,
                    "status": str(r.status),
                    "employmentRate": Decimal(r.employmentRate),
                    "contractEndDate": r.contractEndDate,
                    "position": r.position or "—",
                }
                if can_finance:
                    employee["salary"] = Decimal(r.salary or 0)
                employees.append(employee)

        staff_rows: Any = ()
        if access.has("staffSchedule.read") or access.has("departments.read"):
            filters = [department_scope(access, "departments.read")]
            if department_id:
                filters.append(StaffSchedule.departmentId == department_id)
            staff_rows = (
                await self.session.execute(
                    select(StaffSchedule.departmentId, StaffSchedule.rate)
                    .join(Department, Department.id == StaffSchedule.departmentId)
                    .where(*filters)
                )
            ).all()
        salary_rows: Any = ()
        if can_finance and emp_permission:
            month_first = date_from.year * 12 + date_from.month
            month_last = date_to.year * 12 + date_to.month
            salary_filters = [
                employee_scope(access, emp_permission),
                Employee.status != "DISMISSED",
                ((SalaryEntry.year * 12 + SalaryEntry.month) >= month_first),
                ((SalaryEntry.year * 12 + SalaryEntry.month) <= month_last),
            ]
            if department_id:
                salary_filters.append(Employee.departmentId == department_id)
            salary_rows = (
                await self.session.execute(
                    select(Employee.departmentId, SalaryEntry.amount)
                    .join(Employee, Employee.id == SalaryEntry.employeeId)
                    .where(*salary_filters)
                )
            ).all()

        scoped_assets: list[dict[str, Any]] = []
        if can_assets:
            asset_filters = [Asset.isArchived.is_(False), asset_visibility(access, "assets.read")]
            if project_id:
                asset_filters.append(Asset.projectId == project_id)
            if department_id:
                asset_filters.append(
                    or_(
                        exists(
                            select(Mol.id).where(
                                Mol.id == Asset.molId, Mol.departmentId == department_id
                            )
                        ),
                        exists(
                            select(AssetHolding.id)
                            .join(Mol, Mol.id == AssetHolding.molId)
                            .where(
                                AssetHolding.assetId == Asset.id,
                                AssetHolding.quantity > 0,
                                Mol.departmentId == department_id,
                            )
                        ),
                    )
                )
            asset_rows = (
                await self.session.execute(
                    select(
                        Asset.id,
                        Asset.name,
                        Asset.inventoryNumber,
                        Asset.status,
                        Asset.totalCost,
                        Asset.plannedDisposalDate,
                        Mol.department,
                    )
                    .join(Mol, Mol.id == Asset.molId)
                    .where(*asset_filters)
                    .order_by(Asset.name)
                )
            ).all()
            scoped_assets = [
                {
                    "id": r.id,
                    "name": r.name,
                    "inventoryNumber": r.inventoryNumber,
                    "status": str(r.status),
                    "totalCost": float(r.totalCost),
                    "plannedDisposalDate": r.plannedDisposalDate,
                    "mol": {"department": r.department},
                }
                for r in asset_rows
            ]

        vacations: list[dict[str, Any]] = []
        if access.has("vacations.read") and emp_permission:
            vacation_filters = [
                Vacation.startDate <= max(date_to, today_end),
                Vacation.endDate >= min(date_from, today),
                employee_scope(access, "vacations.read"),
            ]
            if department_id:
                vacation_filters.append(Employee.departmentId == department_id)
            vacation_rows = (
                await self.session.execute(
                    select(
                        Vacation.id,
                        Vacation.employeeId,
                        Employee.fullName,
                        Employee.department,
                        Vacation.type,
                        Vacation.startDate,
                        Vacation.endDate,
                    )
                    .join(Employee, Employee.id == Vacation.employeeId)
                    .where(*vacation_filters)
                    .order_by(Vacation.startDate)
                )
            ).all()
            vacations = [
                {
                    "id": r.id,
                    "employeeId": r.employeeId,
                    "employee": r.fullName,
                    "department": r.department,
                    "type": str(r.type),
                    "startDate": r.startDate,
                    "endDate": r.endDate,
                }
                for r in vacation_rows
            ]

        task_data: list[dict[str, Any]] = []
        if can_tasks:
            task_filters = [project_scope(access, "tasks.read")]
            if project_id:
                task_filters.append(Project.id == project_id)
            if department_id:
                task_filters.append(
                    exists(
                        select(ProjectMember.id)
                        .join(Employee, Employee.id == ProjectMember.employeeId)
                        .where(
                            ProjectMember.projectId == Project.id,
                            Employee.departmentId == department_id,
                        )
                    )
                )
            task_rows = (
                await self.session.execute(
                    select(
                        Task.id,
                        Task.name,
                        Task.progress,
                        Task.status,
                        Task.endDate,
                        Task.priority,
                        Project.id.label("project_id"),
                        Project.code,
                        Project.name.label("project_name"),
                        Employee.fullName,
                    )
                    .join(Project, Project.id == Task.projectId)
                    .outerjoin(TaskAssignee, TaskAssignee.taskId == Task.id)
                    .outerjoin(Employee, Employee.id == TaskAssignee.employeeId)
                    .where(*task_filters)
                    .order_by(Task.endDate)
                )
            ).all()
            grouped: dict[str, dict[str, Any]] = {}
            for task_row in task_rows:
                item = grouped.setdefault(
                    task_row.id,
                    {
                        "id": task_row.id,
                        "name": task_row.name,
                        "progress": task_row.progress,
                        "status": str(task_row.status),
                        "endDate": task_row.endDate,
                        "priority": str(task_row.priority),
                        "project": {
                            "id": task_row.project_id,
                            "code": task_row.code,
                            "name": task_row.project_name,
                        },
                        "assignees": [],
                    },
                )
                if task_row.fullName:
                    item["assignees"].append(task_row.fullName)
            task_data = list(grouped.values())

        operations: list[dict[str, Any]] = []
        if can_assets and access.has("operations.read"):
            operation_filters = [
                asset_visibility(access, "operations.read"),
                Operation.date.between(date_from, date_to),
            ]
            if project_id:
                operation_filters.append(Asset.projectId == project_id)
            op_rows = (
                await self.session.execute(
                    select(
                        Operation.id,
                        Operation.type,
                        Operation.date,
                        Asset.id.label("asset_id"),
                        Asset.name,
                        Asset.inventoryNumber,
                    )
                    .join(Asset, Asset.id == Operation.assetId)
                    .where(*operation_filters)
                    .order_by(Operation.date.desc())
                    .limit(12)
                )
            ).all()
            operations = [
                {
                    "id": r.id,
                    "type": str(r.type),
                    "date": r.date,
                    "asset": {
                        "id": r.asset_id,
                        "name": r.name,
                        "inventoryNumber": r.inventoryNumber,
                    },
                }
                for r in op_rows
            ]

        actions: list[dict[str, Any]] = []
        if can_employees and access.has("personnelActions.read") and emp_permission:
            action_filters = [
                employee_scope(access, "personnelActions.read"),
                PersonnelAction.date.between(date_from, date_to),
            ]
            if department_id:
                action_filters.append(Employee.departmentId == department_id)
            action_rows = (
                await self.session.execute(
                    select(
                        PersonnelAction.id,
                        PersonnelAction.type,
                        PersonnelAction.date,
                        Employee.id.label("employee_id"),
                        Employee.fullName,
                    )
                    .join(Employee, Employee.id == PersonnelAction.employeeId)
                    .where(*action_filters)
                    .order_by(PersonnelAction.date.desc())
                    .limit(12)
                )
            ).all()
            actions = [
                {
                    "id": r.id,
                    "type": str(r.type),
                    "date": r.date,
                    "employee": {"id": r.employee_id, "fullName": r.fullName},
                }
                for r in action_rows
            ]

        audit_rows: Any = ()
        if access.has("auditLogs.read"):
            audit_rows = (
                await self.session.execute(
                    select(
                        AuditLog.id,
                        AuditLog.action,
                        AuditLog.entityType,
                        AuditLog.entityId,
                        AuditLog.createdAt,
                        User.name,
                    )
                    .outerjoin(User, User.id == AuditLog.userId)
                    .order_by(AuditLog.createdAt.desc())
                    .limit(12)
                )
            ).all()
        return {
            "departments": departments,
            "projectOptions": project_options,
            "employees": employees,
            "staff": [(r.departmentId, Decimal(r.rate)) for r in staff_rows],
            "salaries": [(r.departmentId, Decimal(r.amount)) for r in salary_rows],
            "projects": projects,
            "tasks": task_data,
            "assets": scoped_assets,
            "vacations": vacations,
            "operations": operations,
            "actions": actions,
            "audits": [
                {
                    "id": r.id,
                    "action": r.action,
                    "entityType": r.entityType,
                    "entityId": r.entityId,
                    "createdAt": r.createdAt,
                    "name": r.name,
                }
                for r in audit_rows
            ],
            "today": today,
            "todayEnd": today_end,
            "horizon": horizon,
            "visibility": {
                "employees": can_employees,
                "projects": can_projects,
                "finance": can_finance,
                "assets": can_assets,
                "audit": access.has("auditLogs.read"),
            },
        }

    async def turnover(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> dict[str, Any]:
        action_scope = employee_scope(access, "personnelActions.read")
        employee_filter = [
            employee_scope(access, "employees.read"),
            employee_scope(access, "personnelActions.read"),
        ]
        action_filter = [action_scope, PersonnelAction.date.between(date_from, date_to)]
        if department_id:
            employee_filter.append(Employee.departmentId == department_id)
            action_filter.append(Employee.departmentId == department_id)
        counts = (
            await self.session.execute(
                select(PersonnelAction.type, func.count())
                .join(Employee, Employee.id == PersonnelAction.employeeId)
                .where(*action_filter, PersonnelAction.type.in_(["HIRE", "DISMISS"]))
                .group_by(PersonnelAction.type)
            )
        ).all()
        count_by_type = {str(r[0]): int(r[1]) for r in counts}
        first_hire = (
            select(func.min(PersonnelAction.date))
            .where(PersonnelAction.employeeId == Employee.id, PersonnelAction.type == "HIRE")
            .scalar_subquery()
        )
        first_dismiss = (
            select(func.min(PersonnelAction.date))
            .where(PersonnelAction.employeeId == Employee.id, PersonnelAction.type == "DISMISS")
            .scalar_subquery()
        )
        rows = (
            await self.session.execute(
                select(
                    Employee.contractSignedDate, Employee.contractEndDate, first_hire, first_dismiss
                ).where(*employee_filter)
            )
        ).all()
        start_count = end_count = 0
        for signed, contract_end, hire, dismiss in rows:
            hire_date, dismiss_date = hire or signed, dismiss or contract_end
            if (
                hire_date
                and hire_date <= date_from
                and (dismiss_date is None or dismiss_date > date_from)
            ):
                start_count += 1
            if (
                hire_date
                and hire_date <= date_to
                and (dismiss_date is None or dismiss_date > date_to)
            ):
                end_count += 1
        average = (start_count + end_count) / 2
        dismissed, hired = count_by_type.get("DISMISS", 0), count_by_type.get("HIRE", 0)
        return {
            "activeAtStart": start_count,
            "activeAtEnd": end_count,
            "dismissedCount": dismissed,
            "hiredCount": hired,
            "averageHeadcount": average,
            "turnoverRate": round(dismissed / average * 100, 1) if average else 0,
        }

    async def profitability(
        self, date_from: datetime, date_to: datetime, project_id: str | None, access: AccessContext
    ) -> list[dict[str, Any]]:
        filters = [
            project_scope(access, "projects.read"),
            project_scope(access, "projectPayroll.read"),
        ]
        if project_id:
            filters.append(Project.id == project_id)
        else:
            filters.append(Project.status == "ACTIVE")
        projects = (
            await self.session.execute(
                select(
                    Project.id,
                    Project.code,
                    Project.name,
                    Project.plannedBudget,
                    Project.actualBudget,
                    Project.plannedRevenue,
                    Project.actualRevenue,
                ).where(*filters)
            )
        ).all()
        rows = []
        for project in projects:
            month_range = and_(
                (FinancePlanEntry.year * 12 + FinancePlanEntry.month)
                >= date_from.year * 12 + date_from.month,
                (FinancePlanEntry.year * 12 + FinancePlanEntry.month)
                <= date_to.year * 12 + date_to.month,
            )
            finance_scope = employee_scope(access, "finance.salary.read")
            finance_project_scope = _id_scope(
                access, "finance.salary.read", FinancePlanEntry.projectId
            )
            payroll = await self.session.scalar(
                select(func.coalesce(func.sum(FinancePlanEntry.amount), 0))
                .join(Employee, Employee.id == FinancePlanEntry.employeeId)
                .where(
                    FinancePlanEntry.projectId == project.id,
                    finance_scope,
                    finance_project_scope,
                    month_range,
                )
            )
            # Each request has at most one contract by schema; sum only the project-scoped requests.
            from app.models.procurement import ProcurementContract, ProcurementRequest

            procurement = await self.session.scalar(
                select(func.coalesce(func.sum(ProcurementContract.amount), 0))
                .join(ProcurementRequest, ProcurementRequest.id == ProcurementContract.requestId)
                .where(ProcurementRequest.projectId == project.id)
            )
            payroll_cost, procurement_cost = float(payroll or 0), float(procurement or 0)
            total_cost = payroll_cost + procurement_cost
            planned_revenue = float(project.plannedRevenue or project.plannedBudget)
            actual_revenue = float(project.actualRevenue or project.actualBudget)
            profit = actual_revenue - total_cost
            rows.append(
                {
                    "id": project.id,
                    "code": project.code,
                    "name": project.name,
                    "plannedRevenue": planned_revenue,
                    "actualRevenue": actual_revenue,
                    "payrollCost": payroll_cost,
                    "procurementCost": procurement_cost,
                    "totalCost": total_cost,
                    "profit": profit,
                    "profitabilityRate": round(profit / actual_revenue * 100, 1)
                    if actual_revenue > 0
                    else 0,
                }
            )
        return rows

    async def depreciation(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> dict[str, Any]:
        filters = [Asset.isArchived.is_(False), asset_visibility(access, "assets.read")]
        if department_id:
            filters.append(Mol.departmentId == department_id)
        rows = (
            await self.session.execute(
                select(
                    Asset.id,
                    Asset.name,
                    Asset.inventoryNumber,
                    Asset.totalCost,
                    Asset.initialCost,
                    Asset.usefulLifeMonths,
                    Asset.recordingDate,
                    Mol.fullName,
                    Mol.department,
                )
                .join(Mol, Mol.id == Asset.molId)
                .where(*filters)
            )
        ).all()
        assets = []
        for r in rows:
            initial = float(r.initialCost) if r.initialCost > 0 else float(r.totalCost)
            life = r.usefulLifeMonths or 60
            start = max(r.recordingDate, date_from)
            months = max(1, (date_to.year - start.year) * 12 + date_to.month - start.month + 1)
            depreciation = min(initial, initial / life * months) if start <= date_to else 0
            assets.append(
                {
                    "id": r.id,
                    "name": r.name,
                    "inventoryNumber": r.inventoryNumber,
                    "initialCost": initial,
                    "depreciation": round(depreciation, 2),
                    "residualValue": round(initial - depreciation, 2),
                    "mol": r.fullName,
                    "department": r.department,
                }
            )
        movements = []
        if access.has("operations.read"):
            movement_filter = [
                Operation.date.between(date_from, date_to),
                Operation.type.in_(["TRANSFER", "RECEIPT", "DISPOSAL"]),
                asset_visibility(access, "operations.read"),
            ]
            if department_id:
                movement_filter.append(or_(Mol.departmentId == department_id))
            movement_rows = (
                await self.session.execute(
                    select(
                        Operation.id,
                        Operation.date,
                        Operation.type,
                        Asset.name,
                        Asset.inventoryNumber,
                        Operation.fromMolId,
                        Operation.toMolId,
                        Operation.quantity,
                        Operation.reason,
                    )
                    .join(Asset, Asset.id == Operation.assetId)
                    .join(Mol, Mol.id == Asset.molId)
                    .where(*movement_filter)
                    .order_by(Operation.date.desc())
                )
            ).all()
            for movement_row in movement_rows:
                from_name = (
                    await self.session.scalar(
                        select(Mol.fullName).where(Mol.id == movement_row.fromMolId)
                    )
                    if movement_row.fromMolId
                    else None
                )
                to_name = (
                    await self.session.scalar(
                        select(Mol.fullName).where(Mol.id == movement_row.toMolId)
                    )
                    if movement_row.toMolId
                    else None
                )
                movements.append(
                    {
                        "id": movement_row.id,
                        "date": movement_row.date,
                        "type": str(movement_row.type),
                        "assetName": movement_row.name,
                        "inventoryNumber": movement_row.inventoryNumber,
                        "fromMol": from_name or "—",
                        "toMol": to_name or "—",
                        "quantity": float(movement_row.quantity),
                        "reason": movement_row.reason or "—",
                    }
                )
        return {"assets": assets, "movements": movements}

    async def vacation_calendar(
        self,
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        access: AccessContext,
    ) -> list[dict[str, Any]]:
        filters = [
            Vacation.startDate <= date_to,
            Vacation.endDate >= date_from,
            employee_scope(access, "vacations.read"),
        ]
        if department_id:
            filters.append(Employee.departmentId == department_id)
        rows = (
            await self.session.execute(
                select(
                    Vacation.id,
                    Employee.fullName,
                    Employee.department,
                    Vacation.startDate,
                    Vacation.endDate,
                    Vacation.type,
                )
                .join(Employee, Employee.id == Vacation.employeeId)
                .where(*filters)
                .order_by(Vacation.startDate)
            )
        ).all()
        return [
            {
                "id": r.id,
                "employeeName": r.fullName,
                "department": r.department,
                "startDate": r.startDate,
                "endDate": r.endDate,
                "type": str(r.type),
                "durationDays": (r.endDate.date() - r.startDate.date()).days + 1,
            }
            for r in rows
        ]

    async def list_presets(self, user_id: str) -> list[dict[str, Any]]:
        from app.models.reporting import ReportPreset

        rows = (
            await self.session.scalars(
                select(ReportPreset)
                .where(ReportPreset.createdById == user_id)
                .order_by(ReportPreset.createdAt.desc())
            )
        ).all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "metrics": r.metrics or [],
                "groupBy": r.groupBy,
                "filters": r.filters,
                "createdById": r.createdById,
                "createdAt": r.createdAt,
            }
            for r in rows
        ]

    async def save_preset(self, user_id: str, body: dict[str, Any]) -> dict[str, Any]:
        from app.models.reporting import ReportPreset

        row = ReportPreset(
            createdById=user_id,
            name=body["name"],
            metrics=body["metrics"],
            groupBy=body.get("groupBy"),
            filters=body.get("filters"),
        )
        self.session.add(row)
        await self.session.flush()
        return {
            "id": row.id,
            "name": row.name,
            "metrics": row.metrics or [],
            "groupBy": row.groupBy,
            "filters": row.filters,
            "createdById": row.createdById,
            "createdAt": row.createdAt,
        }

    async def delete_preset(self, user_id: str, preset_id: str) -> bool:
        from app.models.reporting import ReportPreset

        row = await self.session.scalar(
            select(ReportPreset).where(
                ReportPreset.id == preset_id, ReportPreset.createdById == user_id
            )
        )
        if row is None:
            return False
        await self.session.delete(row)
        return True

    async def custom_report(
        self,
        group_by: str,
        metrics: list[str],
        date_from: datetime,
        date_to: datetime,
        department_id: str | None,
        project_id: str | None,
        access: AccessContext,
    ) -> list[dict[str, Any]]:
        if group_by == "department":
            groups = await self.session.execute(
                select(Department.id, Department.name)
                .where(
                    Department.isActive.is_(True),
                    department_scope(access, "departments.read"),
                    *([Department.id == department_id] if department_id else []),
                )
                .order_by(Department.name)
            )
            result = []
            for dept_id, name in groups.all():
                row: dict[str, Any] = {"groupKey": dept_id, "groupName": name}
                if "headcount" in metrics or "occupiedRate" in metrics:
                    employee_filter = [
                        Employee.departmentId == dept_id,
                        Employee.status != "DISMISSED",
                        employee_scope(access, "employees.read"),
                    ]
                    count, rate = (
                        await self.session.execute(
                            select(
                                func.count(Employee.id),
                                func.coalesce(func.sum(Employee.employmentRate), 0),
                            ).where(*employee_filter)
                        )
                    ).one()
                    if "headcount" in metrics:
                        row["headcount"] = int(count or 0)
                    if "occupiedRate" in metrics:
                        row["occupiedRate"] = float(rate or 0)
                if "plannedFot" in metrics:
                    stmt = (
                        select(
                            func.coalesce(
                                func.sum(StaffSchedule.salary * Employee.employmentRate), 0
                            )
                        )
                        .join(Employee, Employee.staffScheduleId == StaffSchedule.id)
                        .where(
                            Employee.departmentId == dept_id,
                            Employee.status != "DISMISSED",
                            employee_scope(access, "finance.salary.read"),
                        )
                    )
                    row["plannedFot"] = float(await self.session.scalar(stmt) or 0) * max(
                        1,
                        (date_to.year - date_from.year) * 12 + date_to.month - date_from.month + 1,
                    )
                if "assetValue" in metrics:
                    row["assetValue"] = float(
                        await self.session.scalar(
                            select(func.coalesce(func.sum(Asset.totalCost), 0))
                            .join(Mol, Mol.id == Asset.molId)
                            .where(
                                Mol.departmentId == dept_id,
                                Asset.isArchived.is_(False),
                                asset_visibility(access, "assets.read"),
                            )
                        )
                        or 0
                    )
                result.append(row)
            return result
        filters = [project_scope(access, "projects.read")]
        if project_id:
            filters.append(Project.id == project_id)
        else:
            filters.append(Project.status == "ACTIVE")
        projects = (
            await self.session.execute(
                select(
                    Project.id,
                    Project.code,
                    Project.name,
                    Project.plannedBudget,
                    Project.actualBudget,
                )
                .where(*filters)
                .order_by(Project.name)
            )
        ).all()
        result = []
        for project in projects:
            row = {"groupKey": project.id, "groupName": f"{project.code} — {project.name}"}
            if "projectBudget" in metrics:
                row.update(
                    plannedBudget=float(project.plannedBudget),
                    actualBudget=float(project.actualBudget),
                )
            if "actualFot" in metrics:
                stmt = (
                    select(func.coalesce(func.sum(FinancePlanEntry.amount), 0))
                    .join(Employee, Employee.id == FinancePlanEntry.employeeId)
                    .where(
                        FinancePlanEntry.projectId == project.id,
                        employee_scope(access, "finance.salary.read"),
                        _id_scope(access, "finance.salary.read", FinancePlanEntry.projectId),
                        (FinancePlanEntry.year * 12 + FinancePlanEntry.month).between(
                            date_from.year * 12 + date_from.month, date_to.year * 12 + date_to.month
                        ),
                    )
                )
                row["actualFot"] = float(await self.session.scalar(stmt) or 0)
            if "assetValue" in metrics:
                row["assetValue"] = float(
                    await self.session.scalar(
                        select(func.coalesce(func.sum(Asset.totalCost), 0)).where(
                            Asset.projectId == project.id,
                            Asset.isArchived.is_(False),
                            asset_visibility(access, "assets.read"),
                        )
                    )
                    or 0
                )
            result.append(row)
        return result

    async def my_actions(
        self, actor_id: str, employee_id: str | None, access: AccessContext, now: datetime
    ) -> dict[str, Any]:
        from app.models.enums import TaskStatus

        items: list[dict[str, Any]] = []
        task_count = 0
        if access.has("tasks.read") and employee_id:
            task_filter = [
                Task.status != TaskStatus.COMPLETED,
                TaskAssignee.employeeId == employee_id,
                project_scope(access, "tasks.read"),
            ]
            task_count = int(
                await self.session.scalar(
                    select(func.count(func.distinct(Task.id)))
                    .join(Project, Project.id == Task.projectId)
                    .join(TaskAssignee, TaskAssignee.taskId == Task.id)
                    .where(*task_filter)
                )
                or 0
            )
            task_rows = (
                await self.session.execute(
                    select(
                        Task.id,
                        Task.name,
                        Task.priority,
                        Task.endDate,
                        Task.projectId,
                        Project.code,
                        Project.name.label("project_name"),
                    )
                    .join(Project, Project.id == Task.projectId)
                    .join(TaskAssignee, TaskAssignee.taskId == Task.id)
                    .where(*task_filter)
                    .order_by(Task.endDate.asc().nullslast(), Task.id)
                    .limit(12)
                )
            ).all()
            items.extend(
                {
                    "id": f"task:{r.id}",
                    "kind": "task",
                    "title": r.name,
                    "detail": f"Задача · {r.code}",
                    "href": f"/projects/{r.projectId}?tab=tasks",
                    "dueAt": r.endDate,
                    "priority": str(r.priority),
                }
                for r in task_rows
            )

        approvals: list[dict[str, Any]] = []
        if access.has("approvals.decide"):
            approval_rows = (
                await self.session.execute(
                    select(
                        ApprovalRequest.id,
                        ApprovalRequest.title,
                        ApprovalRequest.dueAt,
                        ApprovalStep.sequence,
                        ApprovalStep.name,
                    )
                    .join(
                        ApprovalStep,
                        and_(
                            ApprovalStep.requestId == ApprovalRequest.id,
                            ApprovalStep.sequence == ApprovalRequest.currentStep,
                            ApprovalStep.approverId == actor_id,
                            ApprovalStep.status == "PENDING",
                        ),
                    )
                    .where(ApprovalRequest.status == "PENDING")
                    .order_by(ApprovalRequest.dueAt.asc().nullslast(), ApprovalRequest.id)
                )
            ).all()
            approvals = [
                {"id": r.id, "title": r.title, "dueAt": r.dueAt, "stepName": r.name}
                for r in approval_rows
            ]
            items.extend(
                {
                    "id": f"approval:{r['id']}",
                    "kind": "approval",
                    "title": r["title"],
                    "detail": f"Согласование · {r['stepName']}",
                    "href": f"/approvals/{r['id']}",
                    "dueAt": r["dueAt"],
                    "priority": "MEDIUM",
                }
                for r in approvals
            )

        discrepancy_count = 0
        department_ids = access.allowed_department_ids("assets.inventory.manage")
        can_inventory = access.has("assets.inventory.manage") and (
            department_ids is None or bool(department_ids)
        )
        if can_inventory:
            discrepancy_filter = [
                AssetInventoryEntry.foundQuantity.is_not(None),
                AssetInventoryEntry.foundQuantity != AssetInventoryEntry.expectedQuantity,
                AssetInventory.status == "IN_PROGRESS",
            ]
            if department_ids is not None:
                discrepancy_filter.append(Mol.departmentId.in_(department_ids))
            base = (
                select(AssetInventoryEntry.id)
                .join(AssetInventory, AssetInventory.id == AssetInventoryEntry.inventoryId)
                .join(Mol, Mol.id == AssetInventory.molId)
                .where(*discrepancy_filter)
            )
            discrepancy_count = int(
                await self.session.scalar(select(func.count()).select_from(base.subquery())) or 0
            )
            inventory_rows = (
                await self.session.execute(
                    select(
                        AssetInventoryEntry.id,
                        AssetInventoryEntry.assetName,
                        AssetInventoryEntry.inventoryId,
                        AssetInventory.name,
                    )
                    .join(AssetInventory, AssetInventory.id == AssetInventoryEntry.inventoryId)
                    .join(Mol, Mol.id == AssetInventory.molId)
                    .where(*discrepancy_filter)
                    .order_by(AssetInventoryEntry.updatedAt.desc(), AssetInventoryEntry.id)
                    .limit(12)
                )
            ).all()
            items.extend(
                {
                    "id": f"inventory:{r.id}",
                    "kind": "inventory",
                    "title": r.assetName,
                    "detail": f"Расхождение · {r.name}",
                    "href": f"/assets/inventory/{r.inventoryId}",
                    "dueAt": None,
                    "priority": "MEDIUM",
                }
                for r in inventory_rows
            )

        contract_count = 0
        if access.has("employees.read") and employee_id:
            employee = await self.session.execute(
                select(Employee.id, Employee.contractEndDate).where(
                    Employee.id == employee_id,
                    Employee.status != "DISMISSED",
                    Employee.contractEndDate <= now + timedelta(days=90),
                )
            )
            contract = employee.one_or_none()
            if contract and contract.contractEndDate:
                contract_count = 1
                items.append(
                    {
                        "id": f"contract:{contract.id}",
                        "kind": "contract",
                        "title": "Истекает трудовой договор",
                        "detail": "Личный срок",
                        "href": f"/employees/{contract.id}",
                        "dueAt": contract.contractEndDate,
                        "priority": "MEDIUM",
                    }
                )

        def urgency(due_at: datetime | None, priority: str) -> int:
            if due_at is None:
                return {"CRITICAL": 1, "HIGH": 2}.get(priority, 3)
            if due_at < now:
                return 0
            if due_at < now + __import__("datetime").timedelta(days=3):
                return 1
            if due_at < now + __import__("datetime").timedelta(days=14):
                return 2
            return 3

        for item in items:
            item["urgency"] = urgency(item["dueAt"], item.pop("priority"))
        items.sort(key=lambda item: (item["urgency"], item["dueAt"] or datetime.max, item["id"]))
        return {
            "items": items[:10],
            "total": task_count + len(approvals) + discrepancy_count + contract_count,
        }
