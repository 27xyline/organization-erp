"""Fixtures restricted to the empty, schema-only Stage04 PostgreSQL copy."""

import os
import uuid
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import delete, or_
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.db.registry  # noqa: F401
from app.core.config import Settings
from app.core.context import Actor, RequestContext
from app.db.uow import create_unit_of_work_factory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.assets import Asset
from app.models.catalogs import AssetGroup, Mol
from app.models.departments import Department
from app.models.employees import Employee
from app.models.enums import AppRole, ScopeMode, UserRole
from app.models.timekeeping import StaffSchedule
from app.models.users import AuditLog, User, UserRoleAssignment
from app.services.catalogs import CatalogService
from app.services.departments import DepartmentService


def wire(record):
    """Convert a typed application result to its public contract shape for assertions."""
    return record.as_dict() if hasattr(record, "as_dict") else record


@pytest.fixture
async def organization_env() -> AsyncIterator[dict]:
    stage08_url = os.environ.get("STAGE08_TEST_DATABASE_URL")
    stage07_url = os.environ.get("STAGE07_TEST_DATABASE_URL")
    stage06_url = os.environ.get("STAGE06_TEST_DATABASE_URL")
    stage05_url = os.environ.get("STAGE05_TEST_DATABASE_URL")
    url = (
        stage08_url
        or stage07_url
        or stage06_url
        or stage05_url
        or os.environ.get("STAGE04_TEST_DATABASE_URL", "")
    )
    expected_database = (
        "erp_stage08_test"
        if stage08_url
        else "erp_stage07_test"
        if stage07_url
        else "erp_stage06_test"
        if stage06_url
        else "erp_stage05_test"
        if stage05_url
        else "erp_stage04_test"
    )
    parsed = make_url(url) if url else None
    if (
        parsed is None
        or parsed.get_backend_name() != "postgresql"
        or parsed.database != expected_database
    ):
        pytest.fail(
            "STAGE04_TEST_DATABASE_URL, STAGE05_TEST_DATABASE_URL, or "
            "STAGE06_TEST_DATABASE_URL must point exactly "
            "to its dedicated PostgreSQL test database"
        )
    url = Settings(database_url=url).database_url.get_secret_value()
    engine = create_async_engine(url, echo=False, hide_parameters=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    factory = create_unit_of_work_factory(sessions)
    prefix = "s4-" + uuid.uuid4().hex
    user_id = prefix + "-user"
    department_ids: list[str] = []
    mol_ids: list[str] = []
    group_ids: list[str] = []
    asset_ids: list[str] = []
    employee_ids: list[str] = []
    staff_schedule_ids: list[str] = []
    try:
        async with sessions() as session:
            session.add(
                User(
                    id=user_id,
                    username=user_id,
                    name="Stage04 test actor",
                    passwordHash="unused-stage04-fixture-hash",
                    role=UserRole.ADMIN,
                )
            )
            session.add(
                UserRoleAssignment(
                    id=prefix + "-assignment",
                    userId=user_id,
                    role=AppRole.ADMIN,
                    departmentScopeMode=ScopeMode.ALL,
                    projectScopeMode=ScopeMode.ALL,
                )
            )
            await session.commit()
        actor = Actor(
            actor_id=user_id,
            is_authenticated=True,
            session_version=1,
            access=AccessContext(
                user_id=user_id,
                employee_id=None,
                employee_department_id=None,
                member_project_ids=(),
                grants=(ScopeGrant(prefix + "-admin", "ADMIN", "ALL", "ALL"),),
            ),
        )
        yield {
            "engine": engine,
            "sessions": sessions,
            "factory": factory,
            "departments": DepartmentService(factory),
            "catalogs": CatalogService(factory),
            "actor": actor,
            "context": RequestContext(prefix + "-request", actor=actor),
            "prefix": prefix,
            "department_ids": department_ids,
            "mol_ids": mol_ids,
            "group_ids": group_ids,
            "asset_ids": asset_ids,
            "employee_ids": employee_ids,
            "staff_schedule_ids": staff_schedule_ids,
        }
    finally:
        async with sessions() as session:
            await session.execute(
                delete(AuditLog).where(
                    or_(
                        AuditLog.userId == user_id,
                        AuditLog.entityId.like(prefix + "%"),
                        AuditLog.requestId == prefix + "-request",
                    )
                )
            )
            await session.execute(delete(Asset).where(Asset.id.in_(asset_ids)))
            await session.execute(delete(Mol).where(Mol.id.in_(mol_ids)))
            await session.execute(delete(AssetGroup).where(AssetGroup.id.in_(group_ids)))
            await session.execute(
                delete(StaffSchedule).where(StaffSchedule.id.in_(staff_schedule_ids))
            )
            await session.execute(delete(Employee).where(Employee.id.in_(employee_ids)))
            await session.execute(delete(Department).where(Department.id.in_(department_ids)))
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()
        await engine.dispose()
