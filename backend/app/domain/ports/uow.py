"""Framework-independent transaction and repository boundary."""

from __future__ import annotations

from types import TracebackType
from typing import Protocol, Self, TypeVar

from app.domain.ports.audit import AuditPort
from app.domain.ports.departments import DepartmentRepository, GroupRepository, MolRepository
from app.domain.ports.employees import EmployeeRepository, WorkforceRepository
from app.domain.ports.notifications import NotificationIntentPort
from app.domain.ports.users import UserRepository


class UnitOfWork(Protocol):
    @property
    def users(self) -> UserRepository: ...

    @property
    def audit(self) -> AuditPort: ...

    @property
    def notifications(self) -> NotificationIntentPort: ...

    @property
    def departments(self) -> DepartmentRepository: ...

    @property
    def groups(self) -> GroupRepository: ...

    @property
    def mols(self) -> MolRepository: ...

    @property
    def employees(self) -> EmployeeRepository: ...

    @property
    def workforce(self) -> WorkforceRepository: ...

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
