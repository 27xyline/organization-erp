"""Framework-independent transaction and repository boundary."""

from __future__ import annotations

from types import TracebackType
from typing import Protocol, Self, TypeVar

from app.domain.ports.audit import AuditPort
from app.domain.ports.notifications import NotificationIntentPort


class UnitOfWork(Protocol):
    @property
    def audit(self) -> AuditPort: ...

    @property
    def notifications(self) -> NotificationIntentPort: ...

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> bool | None: ...

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...


UnitOfWork_co = TypeVar("UnitOfWork_co", bound=UnitOfWork, covariant=True)


class UnitOfWorkFactory(Protocol[UnitOfWork_co]):
    def __call__(self) -> UnitOfWork_co: ...
