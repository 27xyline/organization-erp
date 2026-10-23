"""SQLAlchemy implementation of the application transaction boundary."""

from __future__ import annotations

from enum import Enum, auto
from types import TracebackType

from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.db.registry  # noqa: F401  # Register relationship targets before any repository flush.
from app.domain.errors import RetryableTransactionError
from app.domain.ports.approvals import ApprovalRepository
from app.domain.ports.assets import AssetRepository
from app.domain.ports.audit import AuditPort
from app.domain.ports.departments import DepartmentRepository, GroupRepository, MolRepository
from app.domain.ports.employees import EmployeeRepository, WorkforceRepository
from app.domain.ports.notifications import NotificationIntentPort
from app.domain.ports.projects import ProjectRepository
from app.domain.ports.smtp import SmtpSettingsPort
from app.domain.ports.users import UserRepository
from app.repositories.approvals import SqlAlchemyApprovalRepository
from app.repositories.assets import SqlAlchemyAssetRepository
from app.repositories.audit import SqlAlchemyAuditRepository
from app.repositories.departments import (
    SqlAlchemyDepartmentRepository,
    SqlAlchemyGroupRepository,
    SqlAlchemyMolRepository,
)
from app.repositories.documents import SqlAlchemyDocumentRepository
from app.repositories.employees import SqlAlchemyEmployeeRepository
from app.repositories.notifications import SqlAlchemyNotificationRepository
from app.repositories.projects import SqlAlchemyProjectRepository
from app.repositories.smtp_settings import SqlAlchemySmtpSettingsRepository
from app.repositories.users import SqlAlchemyUserRepository
from app.repositories.workforce import SqlAlchemyWorkforceRepository


class UnitOfWorkStateError(RuntimeError):
    """Raised when an operation is attempted outside an active UoW."""


class _State(Enum):
    NEW = auto()
    ACTIVE = auto()
    COMMITTED = auto()
    ROLLED_BACK = auto()
    CLOSED = auto()


class SqlAlchemyUnitOfWork:
    """Own exactly one session and one terminal transaction decision."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self._state = _State.NEW
        self.documents = SqlAlchemyDocumentRepository(self._active_session)
        self.approvals: ApprovalRepository = SqlAlchemyApprovalRepository(self._active_session)
        self.assets: AssetRepository = SqlAlchemyAssetRepository(self._active_session)
        self.projects: ProjectRepository = SqlAlchemyProjectRepository(self._active_session)
        self.users: UserRepository = SqlAlchemyUserRepository(self._active_session)
        self.audit: AuditPort = SqlAlchemyAuditRepository(self._active_session)
        self.notifications: NotificationIntentPort = SqlAlchemyNotificationRepository(
            self._active_session
        )
        self.smtp_settings: SmtpSettingsPort = SqlAlchemySmtpSettingsRepository(
            self._active_session
        )
        self.departments: DepartmentRepository = SqlAlchemyDepartmentRepository(
            self._active_session
        )
        self.groups: GroupRepository = SqlAlchemyGroupRepository(self._active_session)
        self.employees: EmployeeRepository = SqlAlchemyEmployeeRepository(self._active_session)
        self.workforce: WorkforceRepository = SqlAlchemyWorkforceRepository(self._active_session)
        self.mols: MolRepository = SqlAlchemyMolRepository(self._active_session)

    async def __aenter__(self) -> SqlAlchemyUnitOfWork:
        if self._state is not _State.NEW:
            raise UnitOfWorkStateError("A unit of work can only be entered once")

        session: AsyncSession | None = None
        try:
            session = self._session_factory()
            self._session = session
            await session.begin()
        except BaseException:
            if session is not None:
                await session.close()
            self._session = None
            self._state = _State.CLOSED
            raise

        self._state = _State.ACTIVE
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool:
        session = self._session
        try:
            if self._state is _State.ACTIVE:
                await self.rollback()
        finally:
            if session is not None:
                await session.close()
            self._session = None
            if self._state is not _State.CLOSED:
                self._state = _State.CLOSED
        if isinstance(exc, DBAPIError) and getattr(exc.orig, "sqlstate", None) in {
            "40001",
            "40P01",
        }:
            raise RetryableTransactionError from exc
        return False

    async def commit(self) -> None:
        session = self._active_session()
        try:
            await session.commit()
        except BaseException:
            try:
                await session.rollback()
            finally:
                self._state = _State.ROLLED_BACK
            raise
        self._state = _State.COMMITTED

    async def rollback(self) -> None:
        session = self._active_session()
        try:
            await session.rollback()
        finally:
            self._state = _State.ROLLED_BACK

    def _active_session(self) -> AsyncSession:
        if self._state is _State.COMMITTED:
            raise UnitOfWorkStateError("The unit of work is already committed")
        if self._state is _State.ROLLED_BACK:
            raise UnitOfWorkStateError("The unit of work is already rolled back")
        if self._state is not _State.ACTIVE or self._session is None:
            raise UnitOfWorkStateError("The unit of work is not active")
        return self._session


class SqlAlchemyUnitOfWorkFactory:
    """Create a fresh UoW and AsyncSession on every call."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    def __call__(self) -> SqlAlchemyUnitOfWork:
        return SqlAlchemyUnitOfWork(self._session_factory)


def create_unit_of_work_factory(
    session_factory: async_sessionmaker[AsyncSession],
) -> SqlAlchemyUnitOfWorkFactory:
    return SqlAlchemyUnitOfWorkFactory(session_factory)
