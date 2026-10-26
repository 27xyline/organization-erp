"""Фикстуры пишут только в явно защищённые временные тестовые копии PostgreSQL."""

import uuid
from collections.abc import AsyncIterator

import pytest
from pydantic import SecretStr
from sqlalchemy import delete, or_
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.db.registry  # noqa: F401
from app.core.config import Settings
from app.db.uow import create_unit_of_work_factory
from app.integrations.password_hash import Argon2PasswordHasher
from app.models.enums import AppRole, ScopeMode, UserRole
from app.models.users import AuditLog, User, UserRoleAssignment
from app.services.auth import AuthService
from app.services.users import UserService
from tests.audit_cleanup import clear_audit_logs_for_test_cleanup
from tests.database import test_database_url as resolve_test_database_url

PASSWORD = "auth-password!"


@pytest.fixture
async def auth_env() -> AsyncIterator[dict]:
    url = resolve_test_database_url()
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
                    name="auth test",
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
            await clear_audit_logs_for_test_cleanup(session)
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
