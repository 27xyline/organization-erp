"""Lease, send and complete notification email records.

Delivery is at least once: a crash before SMTP leaves a five-minute lease for retry.
If SMTP accepts a message and the subsequent completion transaction fails, reclaiming
that lease can send a duplicate; the schema has no provider idempotency key to prevent it.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime

from app.domain.ports.email import EmailSender
from app.domain.ports.outbox import ProcessingResult
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory

MAX_BATCH = 100


async def process_outbox(
    sender: EmailSender,
    uow_factory: UnitOfWorkFactory[UnitOfWork],
    limit: int = 50,
    *,
    now: datetime | None = None,
    clock: Callable[[], datetime] | None = None,
) -> ProcessingResult:
    def operation_time() -> datetime:
        if now is not None:
            return now
        return clock() if clock is not None else datetime.now(UTC).replace(tzinfo=None)

    batch_size = min(max(limit, 1), MAX_BATCH)
    async with uow_factory() as uow:
        await uow.outbox.reclaim_exhausted(operation_time())
        await uow.commit()

    sent = failed = 0
    for _ in range(batch_size):
        async with uow_factory() as uow:
            item = await uow.outbox.claim(operation_time())
            await uow.commit()
        if item is None:
            break

        try:
            await sender.send({"userId": item.user_id, **item.payload})
        except Exception as error:
            async with uow_factory() as uow:
                changed = await uow.outbox.fail(
                    item.id,
                    item.claim_token,
                    item.attempts,
                    type(error).__name__[:1000],
                    operation_time(),
                )
                await uow.commit()
            failed += int(changed)
            continue

        # If SMTP accepted the message but this transaction fails, the lease stays
        # PROCESSING and the message may be delivered again after five minutes.
        async with uow_factory() as uow:
            changed = await uow.outbox.complete(item.id, item.claim_token, operation_time())
            await uow.commit()
        sent += int(changed)

    return ProcessingResult(sent=sent, failed=failed, skipped=0)
