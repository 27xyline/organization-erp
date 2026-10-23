from __future__ import annotations

from app.core.context import RequestContext
from app.domain.errors import DomainError
from app.domain.ports.audit import AuditRecord
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.users import authorize


class PayrollPeriodService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def set_status(
        self, year: int, month: int, status: str, context: RequestContext, reason: str | None = None
    ) -> dict[str, object]:
        actor = context.actor
        if actor is None:
            raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
        authorize(actor, "payroll.close")
        async with self._factory() as uow:
            period = await uow.payroll_periods.set_status(
                year, month, status, actor.actor_id, reason
            )
            changed = bool(period.pop("_changed", True))
            if changed:
                await uow.audit.append(
                    AuditRecord(
                        "PAYROLL_PERIOD_CLOSE" if status == "CLOSED" else "PAYROLL_PERIOD_REOPEN",
                        "PayrollPeriod",
                        str(period["id"]),
                        actor.actor_id,
                        {
                            "year": year,
                            "month": month,
                            **({"reason": reason.strip()} if reason else {}),
                        },
                        context.request_id,
                    )
                )
            await uow.commit()
            return period
