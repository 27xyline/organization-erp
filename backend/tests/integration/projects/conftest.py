"""Real PostgreSQL acceptance: graph state, actor checks and transaction rollback."""

from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.core.context import Actor, RequestContext
from app.db.uow import create_unit_of_work_factory
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.models.projects import Project
from app.models.users import AuditLog, User
from app.services.dto.projects import ProjectCommand
from app.services.projects import ProjectService
from app.services.tasks import TaskService


@pytest.fixture
async def project_env(db_session_factory):
    prefix = "s6-" + uuid4().hex
    access = AccessContext(prefix, None, None, (), (ScopeGrant(prefix, "ADMIN", "ALL", "ALL"),))
    actor = Actor(prefix, is_authenticated=True, session_version=1, access=access)
    context = RequestContext(prefix, actor=actor)
    factory = create_unit_of_work_factory(db_session_factory)
    async with db_session_factory() as session:
        session.add(
            User(
                id=prefix,
                username=prefix,
                name="Stage06",
                passwordHash="unused",
                mustChangePassword=False,
                role="ADMIN",
            )
        )
        await session.commit()
    projects, tasks = ProjectService(factory), TaskService(factory)
    project = await projects.create(
        ProjectCommand(prefix, prefix, plannedBudget=Decimal("12.34")), context
    )
    try:
        yield projects, tasks, project, context, db_session_factory
    finally:
        async with db_session_factory() as session:
            await session.execute(delete(Project).where(Project.code.like(prefix + "%")))
            await session.execute(delete(AuditLog).where(AuditLog.userId.like(prefix + "%")))
            await session.execute(delete(User).where(User.id.like(prefix + "%")))
            await session.commit()
