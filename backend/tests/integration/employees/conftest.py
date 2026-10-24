import os
import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import delete
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.db.registry  # noqa: F401
from app.core.config import Settings
from app.core.context import Actor, RequestContext
from app.db.uow import create_unit_of_work_factory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.departments import Department
from app.models.employees import Employee
from app.models.enums import UserRole
from app.models.finance import PersonnelAction
from app.models.timekeeping import StaffSchedule, Vacation
from app.models.users import AuditLog, User
from app.services.employees import EmployeeService
from app.services.personnel_actions import PersonnelActionService
from app.services.workforce import WorkforceService
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


@pytest.fixture
async def hr_env() -> AsyncIterator[dict]:
    stage08_url = os.environ.get("STAGE08_TEST_DATABASE_URL")
    stage07_url = os.environ.get("STAGE07_TEST_DATABASE_URL")
    stage06_url = os.environ.get("STAGE06_TEST_DATABASE_URL")
    url = (
        stage08_url or stage07_url or stage06_url or os.environ.get("STAGE05_TEST_DATABASE_URL", "")
    )
    expected = (
        "erp_stage08_test"
        if stage08_url
        else "erp_stage07_test"
        if stage07_url
        else "erp_stage06_test"
        if stage06_url
        else "erp_stage05_test"
    )
    if not url or make_url(url).database != expected:
        pytest.fail(f"HR tests must point to isolated {expected}")
    engine = create_async_engine(Settings(database_url=url).database_url.get_secret_value())
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    prefix = "s5-" + uuid.uuid4().hex
    user_id, dept_id, staff_id = (prefix + suffix for suffix in ("-user", "-dept", "-staff"))
    factory = create_unit_of_work_factory(sessions)
    async with sessions() as session:
        session.add(
            User(
                id=user_id,
                username=user_id,
                name="Actor",
                passwordHash="unused",
                mustChangePassword=False,
                role=UserRole.ADMIN,
            )
        )
        session.add(Department(id=dept_id, code=dept_id, name=dept_id))
        await session.flush()
        session.add(
            StaffSchedule(
                id=staff_id,
                position="Engineer",
                department=dept_id,
                departmentId=dept_id,
                rate=1,
                salary=100000,
            )
        )
        await session.commit()
    access = AccessContext(user_id, None, None, (), (ScopeGrant(prefix, "ADMIN", "ALL", "ALL"),))
    actor = Actor(actor_id=user_id, is_authenticated=True, session_version=1, access=access)
    try:
        yield dict(
            prefix=prefix,
            user_id=user_id,
            department_id=dept_id,
            staff_id=staff_id,
            sessions=sessions,
            actor=actor,
            context=RequestContext(prefix, actor=actor),
            factory=factory,
            employees=EmployeeService(factory),
            workforce=WorkforceService(factory),
            actions=PersonnelActionService(factory),
        )
    finally:
        async with sessions() as session:
            await clear_audit_logs_for_test_cleanup(session)
            employee_ids = (
                await session.scalars(
                    __import__("sqlalchemy")
                    .select(Employee.id)
                    .where(Employee.code.like(prefix + "%"))
                )
            ).all()
            await session.execute(delete(AuditLog).where(AuditLog.userId == user_id))
            await session.execute(
                delete(PersonnelAction).where(PersonnelAction.employeeId.in_(employee_ids))
            )
            await session.execute(delete(Vacation).where(Vacation.employeeId.in_(employee_ids)))
            await session.execute(
                __import__("sqlalchemy")
                .update(Department)
                .where(Department.headEmployeeId.in_(employee_ids))
                .values(headEmployeeId=None)
            )
            await session.execute(delete(Employee).where(Employee.id.in_(employee_ids)))
            await session.execute(
                delete(StaffSchedule).where(StaffSchedule.departmentId.like(prefix + "%"))
            )
            await session.execute(delete(Department).where(Department.id.like(prefix + "%")))
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()
        await engine.dispose()
