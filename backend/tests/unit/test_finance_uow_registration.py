from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db.uow import SqlAlchemyUnitOfWork
from app.repositories.finance import SqlAlchemyFinanceRepository
from app.repositories.payroll_periods import SqlAlchemyPayrollPeriodRepository
from app.repositories.timekeeping import SqlAlchemyTimekeepingRepository


def test_payroll_period_repository_is_part_of_the_uow() -> None:
    unit_of_work = SqlAlchemyUnitOfWork(async_sessionmaker())

    assert isinstance(unit_of_work.payroll_periods, SqlAlchemyPayrollPeriodRepository)


def test_timekeeping_repository_is_part_of_the_uow() -> None:
    unit_of_work = SqlAlchemyUnitOfWork(async_sessionmaker())

    assert isinstance(unit_of_work.timekeeping, SqlAlchemyTimekeepingRepository)


def test_finance_repository_is_part_of_the_uow() -> None:
    unit_of_work = SqlAlchemyUnitOfWork(async_sessionmaker())

    assert isinstance(unit_of_work.finance, SqlAlchemyFinanceRepository)
