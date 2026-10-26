from collections.abc import Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.ports.audit import AuditRecord
from app.models.users import AuditLog


class SqlAlchemyAuditRepository:
    """API только для добавления записей; неизменяемость на уровне всей базы данных \
обеспечивается передачей DDL."""

    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    async def append(self, record: AuditRecord) -> None:
        self._session().add(
            AuditLog(
                userId=record.user_id,
                action=record.action,
                entityType=record.entity_type,
                entityId=record.entity_id,
                details=record.details,
                requestId=record.request_id,
            )
        )
