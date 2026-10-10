from collections.abc import Callable
from typing import Any

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth.rules import ScopeGrant
from app.domain.errors import DomainError
from app.domain.ports.users import UserRecord
from app.models.departments import Department
from app.models.employees import Employee
from app.models.enums import AppRole, EmployeeStatus, ScopeMode, UserRole
from app.models.projects import Project, ProjectMember
from app.models.users import User, UserDepartmentScope, UserProjectScope, UserRoleAssignment


class SqlAlchemyUserRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def get(self, user_id: str, *, for_update: bool = False) -> UserRecord | None:
        query = select(User).where(User.id == user_id)
        if for_update:
            query = query.with_for_update()
        user = await self._session().scalar(query)
        return await self._record(user) if user else None

    async def by_username_for_update(self, username: str) -> UserRecord | None:
        user = await self._session().scalar(
            select(User).where(User.username == username).with_for_update()
        )
        return await self._record(user) if user else None

    async def _record(self, user: User) -> UserRecord:
        session = self._session()
        assignments = (
            await session.scalars(
                select(UserRoleAssignment)
                .where(UserRoleAssignment.userId == user.id)
                .order_by(UserRoleAssignment.role)
            )
        ).all()
        grants = []
        public_assignments = []
        for assignment in assignments:
            department_ids = tuple(
                (
                    await session.scalars(
                        select(UserDepartmentScope.departmentId)
                        .join(Department, Department.id == UserDepartmentScope.departmentId)
                        .where(UserDepartmentScope.roleAssignmentId == assignment.id)
                        .order_by(Department.name)
                    )
                ).all()
            )
            project_ids = tuple(
                (
                    await session.scalars(
                        select(UserProjectScope.projectId)
                        .join(Project, Project.id == UserProjectScope.projectId)
                        .where(UserProjectScope.roleAssignmentId == assignment.id)
                        .order_by(Project.code)
                    )
                ).all()
            )
            grants.append(
                ScopeGrant(
                    assignment.id,
                    assignment.role.value,
                    assignment.departmentScopeMode.value,
                    assignment.projectScopeMode.value,
                    department_ids,
                    project_ids,
                )
            )
            public_assignments.append(
                {
                    "id": assignment.id,
                    "role": assignment.role.value,
                    "departmentScopeMode": assignment.departmentScopeMode.value,
                    "projectScopeMode": assignment.projectScopeMode.value,
                    "departmentScopes": [
                        {"departmentId": identifier} for identifier in department_ids
                    ],
                    "projectScopes": [{"projectId": identifier} for identifier in project_ids],
                }
            )
        employee = await session.get(Employee, user.employeeId) if user.employeeId else None
        members = (
            tuple(
                (
                    await session.scalars(
                        select(ProjectMember.projectId).where(
                            ProjectMember.employeeId == user.employeeId,
                            ProjectMember.isArchived.is_(False),
                        )
                    )
                ).all()
            )
            if employee
            else ()
        )
        public: dict[str, Any] = {
            key: getattr(user, key)
            for key in (
                "id",
                "username",
                "name",
                "employeeId",
                "isActive",
                "mustChangePassword",
                "lockedUntil",
                "lastLoginAt",
                "createdAt",
                "updatedAt",
            )
        }
        public["role"] = user.role.value
        public["employee"] = (
            {"id": employee.id, "code": employee.code, "fullName": employee.fullName}
            if employee
            else None
        )
        public["roleAssignments"] = public_assignments
        return UserRecord(
            user.id,
            user.username,
            user.name,
            user.role.value,
            user.passwordHash,
            user.isActive,
            user.mustChangePassword,
            user.sessionVersion,
            user.failedLoginAttempts,
            user.lockedUntil,
            user.employeeId,
            employee.departmentId if employee else None,
            members,
            tuple(grants),
            public,
        )

    async def departments(self) -> tuple[tuple[str, str | None], ...]:
        return tuple(
            (row.id, row.parentId)
            for row in (
                await self._session().execute(select(Department.id, Department.parentId))
            ).all()
        )

    async def update_auth(self, user_id: str, values: dict[str, Any]) -> None:
        await self._session().execute(update(User).where(User.id == user_id).values(**values))

    async def list_users(self, page: int, page_size: int) -> tuple[list[dict[str, Any]], int]:
        session = self._session()
        users = (
            await session.scalars(
                select(User)
                .order_by(User.isActive.desc(), User.name)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).all()
        total = await session.scalar(select(func.count()).select_from(User))
        return [(await self._record(user)).public for user in users], int(total or 0)

    async def references(self) -> dict[str, Any]:
        session = self._session()
        departments = (
            (
                await session.execute(
                    select(Department.id, Department.code, Department.name, Department.parentId)
                    .where(Department.isActive.is_(True))
                    .order_by(Department.name)
                )
            )
            .mappings()
            .all()
        )
        projects = (
            (
                await session.execute(
                    select(Project.id, Project.code, Project.name).order_by(Project.code)
                )
            )
            .mappings()
            .all()
        )
        employees = (
            (
                await session.execute(
                    select(Employee.id, Employee.code, Employee.fullName, Employee.departmentId)
                    .where(Employee.status != EmployeeStatus.DISMISSED)
                    .order_by(Employee.fullName)
                )
            )
            .mappings()
            .all()
        )
        return {
            "departments": [dict(row) for row in departments],
            "projects": [dict(row) for row in projects],
            "employees": [dict(row) for row in employees],
        }

    async def validate_references(
        self, assignments: list[dict[str, Any]], employee_id: str | None
    ) -> bool:
        session = self._session()
        department_ids = set(identifier for a in assignments for identifier in a["departmentIds"])
        project_ids = set(identifier for a in assignments for identifier in a["projectIds"])
        departments = (
            await session.scalar(
                select(func.count())
                .select_from(Department)
                .where(Department.id.in_(department_ids))
            )
            if department_ids
            else 0
        )
        projects = (
            await session.scalar(
                select(func.count()).select_from(Project).where(Project.id.in_(project_ids))
            )
            if project_ids
            else 0
        )
        employee = await session.get(Employee, employee_id) if employee_id else None
        return (
            departments == len(department_ids)
            and projects == len(project_ids)
            and (not employee_id or employee is not None)
        )

    async def _assign(self, user_id: str, assignments: list[dict[str, Any]]) -> None:
        session = self._session()
        for a in assignments:
            assignment = UserRoleAssignment(
                userId=user_id,
                role=AppRole(a["role"]),
                departmentScopeMode=ScopeMode(a["departmentScopeMode"]),
                projectScopeMode=ScopeMode(a["projectScopeMode"]),
            )
            session.add(assignment)
            await session.flush()
            session.add_all(
                UserDepartmentScope(roleAssignmentId=assignment.id, departmentId=identifier)
                for identifier in a["departmentIds"]
            )
            session.add_all(
                UserProjectScope(roleAssignmentId=assignment.id, projectId=identifier)
                for identifier in a["projectIds"]
            )
        await session.flush()

    async def create(self, values: dict[str, Any], assignments: list[dict[str, Any]]) -> UserRecord:
        session = self._session()
        user = User(**(values | {"role": UserRole(values["role"])}))
        session.add(user)
        try:
            await session.flush()
            await self._assign(user.id, assignments)
        except IntegrityError as exc:
            if getattr(exc.orig, "sqlstate", None) != "23505":
                raise
            code = (
                "EMPLOYEE_ALREADY_LINKED"
                if "users_employeeId_key" in str(exc.orig)
                else "USERNAME_EXISTS"
            )
            raise DomainError(
                code,
                "Кадровая карточка уже связана с другим пользователем"
                if code == "EMPLOYEE_ALREADY_LINKED"
                else "Пользователь с таким логином уже существует",
                409,
            ) from exc
        return await self._record(user)

    async def update(
        self, user_id: str, values: dict[str, Any], assignments: list[dict[str, Any]] | None
    ) -> UserRecord:
        session = self._session()
        try:
            await session.execute(
                update(User)
                .where(User.id == user_id)
                .values(**(values | {"role": UserRole(values["role"])}))
            )
            if assignments is not None:
                await session.execute(
                    delete(UserRoleAssignment).where(UserRoleAssignment.userId == user_id)
                )
                await self._assign(user_id, assignments)
            await session.flush()
        except IntegrityError as exc:
            if getattr(exc.orig, "sqlstate", None) != "23505":
                raise
            raise DomainError(
                "EMPLOYEE_ALREADY_LINKED",
                "Кадровая карточка уже связана с другим пользователем",
                409,
            ) from exc
        result = await self.get(user_id)
        assert result is not None
        return result

    async def lock_admin_changes(self) -> None:
        await self._session().execute(text("SELECT pg_advisory_xact_lock(1735734988)"))

    async def active_admin_count(self) -> int:
        count = await self._session().scalar(
            select(func.count())
            .select_from(User)
            .where(
                User.isActive.is_(True),
                User.id.in_(
                    select(UserRoleAssignment.userId).where(
                        UserRoleAssignment.role == AppRole.ADMIN
                    )
                ),
            )
        )
        return int(count or 0)
