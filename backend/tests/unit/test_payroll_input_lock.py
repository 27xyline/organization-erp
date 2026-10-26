from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.repositories.payroll_input_lock import SqlAlchemyPayrollInputLockRepository
from app.repositories.payroll_periods import SqlAlchemyPayrollPeriodRepository


class _Session:
    def __init__(self) -> None:
        self.execute = AsyncMock()


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("method", "expected_sql"),
    [
        ("lock_shared", "pg_advisory_xact_lock_shared"),
        ("lock_exclusive", "pg_advisory_xact_lock"),
    ],
)
async def test_payroll_input_gate_uses_transaction_scoped_advisory_lock(
    method: str, expected_sql: str
) -> None:
    session = _Session()
    repository = SqlAlchemyPayrollInputLockRepository(lambda: session)

    await getattr(repository, method)()

    session.execute.assert_awaited_once()
    statement = str(session.execute.await_args.args[0])
    assert expected_sql in statement


@pytest.mark.anyio
async def test_period_lock_acquires_shared_gate_before_period_row_operations() -> None:
    statements: list[str] = []

    class _Result:
        def scalar_one_or_none(self) -> str:
            return "OPEN"

    class _RecordingSession:
        async def execute(self, statement, *args, **kwargs):
            statements.append(str(statement))
            return _Result()

    repository = SqlAlchemyPayrollPeriodRepository(lambda: _RecordingSession())

    assert await repository.lock_period(2099, 12) == "OPEN"
    assert "pg_advisory_xact_lock_shared" in statements[0]
    assert "INSERT INTO payroll_periods" in statements[1]
    assert "FOR UPDATE" in statements[2]
