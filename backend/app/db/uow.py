"""SQLAlchemy implementation of the application transaction boundary."""

from __future__ import annotations

from enum import Enum, auto
from types import TracebackType

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.db.registry  # noqa: F401  # Register relationship targets before any repository flush.
from app.domain.ports.audit import AuditRecord
from app.domain.ports.notifications import NotificationIntent


class UnitOfWorkStateError(RuntimeError):
    """Raised when an operation is attempted outside an active UoW."""


class _State(Enum):
    NEW = auto()
    ACTIVE = auto()
    COMMITTED = auto()
    ROLLED_BACK = auto()
    CLOSED = auto()


class _AuditRepository:
    def __init__(self, owner: SqlAlchemyUnitOfWork) -> None:
        self._owner = owner

    async def append(self, record: AuditRecord) -> None:
        from app.models.users import AuditLog

        session = self._owner._active_session()
        session.add(
            AuditLog(
                userId=record.user_id,
                action=record.action,
                entityType=record.entity_type,
                entityId=record.entity_id,
                details=record.details,
                requestId=record.request_id,
            )
        )


class _NotificationRepository:
    def __init__(self, owner: SqlAlchemyUnitOfWork) -> None:
        self._owner = owner

    async def enqueue(self, intent: NotificationIntent) -> None:
        from app.models.enums import NotificationChannel, NotificationEventType
        from app.models.notifications import Notification, NotificationOutbox

        session = self._owner._active_session()
        notification = Notification(
            userId=intent.user_id,
            eventType=NotificationEventType(intent.event_type),
            channel=NotificationChannel(intent.channel),
            title=intent.title,
            body=intent.body,
            targetUrl=intent.target_url,
            entityType=intent.entity_type,
            entityId=intent.entity_id,
            dedupeKey=intent.dedupe_key,
        )
        session.add(notification)
        await session.flush()
        session.add(
            NotificationOutbox(
                notificationId=notification.id,
                userId=intent.user_id,
                payload=intent.payload,
            )
        )


class SqlAlchemyUnitOfWork:
    """Own exactly one session and one terminal transaction decision."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self._state = _State.NEW
        self.audit = _AuditRepository(self)
        self.notifications = _NotificationRepository(self)

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
