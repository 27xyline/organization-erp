"""Framework-independent transaction and repository boundary."""

from __future__ import annotations

from types import TracebackType
from typing import Protocol, Self, TypeVar

from app.domain.ports.approvals import ApprovalRepository
from app.domain.ports.assets import AssetRepository
from app.domain.ports.audit import AuditPort
from app.domain.ports.departments import DepartmentRepository, GroupRepository, MolRepository
from app.domain.ports.documents import DocumentRepository
from app.domain.ports.employees import EmployeeRepository, WorkforceRepository
from app.domain.ports.finance import FinanceRepository
from app.domain.ports.notifications import NotificationIntentPort
from app.domain.ports.outbox import OutboxRepository
from app.domain.ports.payroll_input_lock import PayrollInputLock
from app.domain.ports.payroll_periods import PayrollPeriodRepository
from app.domain.ports.procurement import ProcurementRepository
from app.domain.ports.projects import ProjectRepository
from app.domain.ports.smtp import SmtpSettingsPort
from app.domain.ports.timekeeping import TimekeepingRepository
from app.domain.ports.users import UserRepository


class UnitOfWork(Protocol):
    @property
    def procurement(self) -> ProcurementRepository: ...

    @property
    def approvals(self) -> ApprovalRepository: ...
    @property
    def documents(self) -> DocumentRepository: ...

    @property
    def assets(self) -> AssetRepository: ...

    @property
    def projects(self) -> ProjectRepository: ...

    @property
    def users(self) -> UserRepository: ...

    @property
    def audit(self) -> AuditPort: ...

    @property
    def notifications(self) -> NotificationIntentPort: ...

    @property
    def outbox(self) -> OutboxRepository: ...

    @property
    def smtp_settings(self) -> SmtpSettingsPort: ...

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

    @property
    def payroll_periods(self) -> PayrollPeriodRepository: ...

    @property
    def payroll_input_lock(self) -> PayrollInputLock: ...

    @property
    def timekeeping(self) -> TimekeepingRepository: ...

    @property
    def finance(self) -> FinanceRepository: ...

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
