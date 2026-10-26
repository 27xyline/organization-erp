from app.domain.ports.audit import AuditPort, AuditRecord


async def append(port: AuditPort, record: AuditRecord) -> None:
    await port.append(record)
