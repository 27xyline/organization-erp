from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.errors import DomainError
from app.domain.finance.period_rules import require_period_open
from app.models.employees import Employee
from app.models.enums import PayrollPeriodStatus
from app.models.finance import PayrollPeriod
from app.models.timekeeping import TimeEntry, Timesheet
from app.repositories.payroll_input_lock import SqlAlchemyPayrollInputLockRepository


class SqlAlchemyPayrollPeriodRepository:
    """Create and lock the unique payroll period row in the caller's transaction."""

    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session
        self._payroll_input_lock = SqlAlchemyPayrollInputLockRepository(session)

    async def get_status(self, year: int, month: int) -> str | None:
        status = await self._session().scalar(
            select(PayrollPeriod.status).where(
                PayrollPeriod.year == year, PayrollPeriod.month == month
            )
        )
        return str(status) if status is not None else None

    async def lock_period(self, year: int, month: int) -> str:
        session = self._session()
        await self._payroll_input_lock.lock_shared()
        statement = (
            insert(PayrollPeriod)
            .values(year=year, month=month)
            .on_conflict_do_nothing(index_elements=[PayrollPeriod.year, PayrollPeriod.month])
        )
        await session.execute(statement)
        result = await session.execute(
            select(PayrollPeriod.status)
            .where(PayrollPeriod.year == year, PayrollPeriod.month == month)
            .with_for_update()
        )
        status = result.scalar_one_or_none()
        if status is None:
            raise RuntimeError("Payroll period row was not created")
        return str(status)

    async def assert_open(self, year: int, month: int) -> None:
        require_period_open(await self.lock_period(year, month))

    async def set_status(
        self,
        year: int,
        month: int,
        status: str,
        actor_id: str,
        reason: str | None = None,
    ) -> dict[str, object]:
        session = self._session()
        await self.lock_period(year, month)
        result = await session.execute(
            select(PayrollPeriod).where(PayrollPeriod.year == year, PayrollPeriod.month == month)
        )
        period = result.scalar_one()
        current_status = str(period.status)
        if current_status == status:
            snapshot = self._snapshot(period)
            snapshot["_changed"] = False
            return snapshot
        if current_status == "CLOSED" and status == "OPEN" and not (reason or "").strip():
            raise DomainError(
                "REOPEN_REASON_REQUIRED", "Укажите причину повторного открытия периода", 422
            )
        if status == "CLOSED":
            start = datetime(year, month, 1)
            end = datetime(year + (month == 12), month % 12 + 1, 1)
            rows = await session.execute(
                select(
                    Employee.id,
                    Employee.status,
                    Timesheet.status,
                    Timesheet.zeroHoursConfirmed,
                    func.count(TimeEntry.id),
                )
                .outerjoin(
                    Timesheet,
                    (Timesheet.employeeId == Employee.id)
                    & (Timesheet.year == year)
                    & (Timesheet.month == month),
                )
                .outerjoin(
                    TimeEntry,
                    (TimeEntry.employeeId == Employee.id)
                    & (TimeEntry.workDate >= start)
                    & (TimeEntry.workDate < end),
                )
                .where(or_(Employee.status != "DISMISSED", TimeEntry.id.is_not(None)))
                .group_by(
                    Employee.id, Employee.status, Timesheet.status, Timesheet.zeroHoursConfirmed
                )
            )
            if any(
                timesheet_status != "APPROVED" or (entry_count == 0 and not zero_confirmed)
                for _, _, timesheet_status, zero_confirmed, entry_count in rows
            ):
                raise DomainError(
                    "PAYROLL_TIMESHEETS_PENDING",
                    "Нельзя закрыть период: есть неутверждённые табели",
                    409,
                )
        period.status = PayrollPeriodStatus(status)
        period.closedAt = datetime.now(UTC).replace(tzinfo=None) if status == "CLOSED" else None
        period.closedById = actor_id if status == "CLOSED" else None
        await session.flush()
        snapshot = self._snapshot(period)
        snapshot["_changed"] = True
        return snapshot

    @staticmethod
    def _snapshot(period: PayrollPeriod) -> dict[str, object]:
        return {
            "id": period.id,
            "year": period.year,
            "month": period.month,
            "status": str(period.status),
            "closedAt": period.closedAt,
            "closedById": period.closedById,
            "createdAt": period.createdAt,
            "updatedAt": period.updatedAt,
        }
