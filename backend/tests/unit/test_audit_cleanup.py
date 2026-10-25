from __future__ import annotations

import pytest

from tests.audit_cleanup import clear_audit_logs_for_test_cleanup


@pytest.mark.anyio
async def test_audit_cleanup_refuses_non_disposable_database_before_truncate() -> None:
    class NonDisposableSession:
        executed: list[object]

        def __init__(self) -> None:
            self.executed = []

        async def scalar(self, statement):
            self.executed.append(statement)
            return "organization_erp_dev"

        async def execute(self, statement):
            self.executed.append(statement)

    session = NonDisposableSession()

    with pytest.raises(RuntimeError, match="named disposable test databases"):
        await clear_audit_logs_for_test_cleanup(session)  # type: ignore[arg-type]

    assert len(session.executed) == 1
