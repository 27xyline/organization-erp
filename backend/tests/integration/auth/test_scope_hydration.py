from decimal import Decimal

import pytest
from sqlalchemy import delete, select, update

from app.models.departments import Department
from app.models.employees import Employee
from app.models.enums import AppRole, ScopeMode
from app.models.projects import Project, ProjectMember
from app.models.users import User, UserDepartmentScope, UserRoleAssignment


@pytest.mark.anyio
async def test_actor_hydrates_descendants_and_only_unarchived_member_projects(auth_env):
    env = auth_env
    prefix = env["prefix"]
    department, child, employee, project, archived = [
        prefix + "-" + suffix for suffix in ("dept", "child", "employee", "project", "archived")
    ]
    user_id = await env["seed"](role="AUDITOR")
    try:
        async with env["sessions"]() as session:
            session.add(Department(id=department, code=department, name=department))
            await session.flush()
            session.add(Department(id=child, code=child, name=child, parentId=department))
            session.add_all(
                [
                    Project(id=project, code=project, name=project),
                    Project(id=archived, code=archived, name=archived),
                ]
            )
            await session.flush()
            session.add(
                Employee(
                    id=employee,
                    code=employee,
                    fullName="Scope employee",
                    department=department,
                    departmentId=child,
                )
            )
            await session.flush()
            session.add_all(
                [
                    ProjectMember(
                        projectId=identifier,
                        employeeId=employee,
                        department=department,
                        position="test",
                        rate=Decimal("1"),
                        salary=Decimal("0"),
                        isArchived=is_archived,
                    )
                    for identifier, is_archived in ((project, False), (archived, True))
                ]
            )
            await session.execute(
                update(User).where(User.id == user_id).values(employeeId=employee)
            )
            assignment = await session.scalar(
                select(UserRoleAssignment).where(UserRoleAssignment.userId == user_id)
            )
            assignment.role = AppRole.HR
            assignment.departmentScopeMode = ScopeMode.ASSIGNED
            assignment.projectScopeMode = ScopeMode.NONE
            session.add(
                UserDepartmentScope(roleAssignmentId=assignment.id, departmentId=department)
            )
            await session.commit()
        actor = await env["auth"].resolve_actor(user_id, 1)
        assert actor.access.member_project_ids == (project,)
        assert set(actor.access.grants[0].department_ids) == {department, child}
        assert actor.access.allows(
            "employees.read", {"employeeId": employee, "departmentId": child}
        )
        assert not actor.access.allows(
            "employees.read", {"employeeId": "foreign", "departmentId": "foreign"}
        )
        async with env["sessions"]() as session:
            assignment = await session.scalar(
                select(UserRoleAssignment).where(UserRoleAssignment.userId == user_id)
            )
            assignment.role = AppRole.EMPLOYEE
            assignment.departmentScopeMode = assignment.projectScopeMode = ScopeMode.SELF
            await session.commit()
        actor = await env["auth"].resolve_actor(user_id, 1)
        assert actor.access.allows("projects.read", {"projectId": project})
        assert not actor.access.allows("projects.read", {"projectId": archived})
        assert actor.access.allows("employees.read", {"employeeId": employee})
        assert not actor.access.allows(
            "employees.read", {"employeeId": "foreign", "departmentId": child}
        )
    finally:
        async with env["sessions"]() as session:
            await session.execute(delete(ProjectMember).where(ProjectMember.employeeId == employee))
            await session.execute(update(User).where(User.id == user_id).values(employeeId=None))
            await session.execute(
                delete(UserDepartmentScope).where(UserDepartmentScope.departmentId == department)
            )
            await session.execute(delete(Employee).where(Employee.id == employee))
            await session.execute(delete(Project).where(Project.id.in_((project, archived))))
            await session.execute(delete(Department).where(Department.id == child))
            await session.execute(delete(Department).where(Department.id == department))
            await session.commit()
