"""Fixtures write only to the explicitly guarded stage03 PostgreSQL copy."""

import os
import uuid
from collections.abc import AsyncIterator

import pytest
from pydantic import SecretStr
from sqlalchemy import delete, or_
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.db.registry  # noqa: F401
from app.core.config import Settings
from app.db.uow import create_unit_of_work_factory
from app.integrations.password_hash import Argon2PasswordHasher
from app.models.enums import AppRole, ScopeMode, UserRole
from app.models.users import AuditLog, User, UserRoleAssignment
from app.services.auth import AuthService
from app.services.users import UserService

PASSWORD = "Stage03-password!"
BRIDGE_SECRET = "stage03-test-bridge-secret-only-xxxxxxxxxxxxxxxx"
INTERNAL_SECRET = "stage03-test-internal-secret-only-yyyyyyyyyyyy"


@pytest.fixture
async def auth_env() -> AsyncIterator[dict]:
    stage08_url = os.environ.get("STAGE08_TEST_DATABASE_URL")
    stage07_url = os.environ.get("STAGE07_TEST_DATABASE_URL")
    stage06_url = os.environ.get("STAGE06_TEST_DATABASE_URL")
    stage05_url = os.environ.get("STAGE05_TEST_DATABASE_URL")
    stage04_url = os.environ.get("STAGE04_TEST_DATABASE_URL")
    url = (
        stage08_url
        or stage07_url
        or stage06_url
        or stage05_url
        or stage04_url
        or os.environ.get("STAGE03_TEST_DATABASE_URL", "")
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
        if stage04_url
        else "erp_stage03_test"
    )
    if (
        not url
        or make_url(url).database != expected_database
        or make_url(url).get_backend_name() != "postgresql"
    ):
        pytest.fail(
            "STAGE03_TEST_DATABASE_URL, STAGE04_TEST_DATABASE_URL, "
            "STAGE05_TEST_DATABASE_URL, or STAGE06_TEST_DATABASE_URL "
            "must point exactly "
            "to its dedicated PostgreSQL test database"
        )
    url = Settings(database_url=url).database_url.get_secret_value()
    engine = create_async_engine(url, echo=False, hide_parameters=True)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    factory = create_unit_of_work_factory(sessions)
    passwords = Argon2PasswordHasher()
    prefix = "s3-" + uuid.uuid4().hex
    user_ids = []

    async def seed(*, role="ADMIN", active=True, forced=False, username=None):
        identifier = prefix + "-" + str(len(user_ids))
        user_ids.append(identifier)
        async with sessions() as session:
            session.add(
                User(
                    id=identifier,
                    username=username or identifier,
                    name="Stage03 test",
                    role=UserRole.ADMIN if role == "ADMIN" else UserRole.VIEWER,
                    passwordHash=await passwords.hash(PASSWORD),
                    isActive=active,
                    mustChangePassword=forced,
                )
            )
            await session.flush()
            session.add(
                UserRoleAssignment(
                    userId=identifier,
                    role=AppRole(role),
                    departmentScopeMode=ScopeMode.SELF if role == "EMPLOYEE" else ScopeMode.ALL,
                    projectScopeMode=ScopeMode.SELF if role == "EMPLOYEE" else ScopeMode.ALL,
                )
            )
            await session.commit()
        return identifier

    try:
        yield {
            "url": SecretStr(url),
            "engine": engine,
            "sessions": sessions,
            "factory": factory,
            "passwords": passwords,
            "auth": AuthService(factory, passwords),
            "users": UserService(factory, passwords),
            "seed": seed,
            "ids": user_ids,
            "prefix": prefix,
        }
    finally:
        async with sessions() as session:
            await session.execute(
                delete(AuditLog).where(
                    or_(
                        AuditLog.userId.in_(user_ids),
                        AuditLog.entityId.in_(user_ids),
                        AuditLog.entityId.like(prefix + "%"),
                    )
                )
            )
            await session.execute(
                delete(User).where(or_(User.id.in_(user_ids), User.username.like(prefix + "%")))
            )
            await session.commit()
        await engine.dispose()
