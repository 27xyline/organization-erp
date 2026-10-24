"""Operational read/seed tasks implemented behind service entry points."""

from __future__ import annotations

from sqlalchemy import String, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assets import Asset, AssetHolding
from app.models.departments import Department
from app.models.documents import Document, DocumentVersion
from app.models.users import AuditLog


class DemoSeedService:
    """Idempotent minimal training catalog seed; never invoked by application startup."""

    async def seed(self, session: AsyncSession) -> dict[str, int]:
        await session.execute(text("SELECT pg_advisory_xact_lock(904202607)"))
        demo_units = (
            ("DEMO", "Учебное подразделение"),
            ("DEMO-HR", "Кадры — учебный контур"),
            ("DEMO-FIN", "Финансы — учебный контур"),
            ("DEMO-OPS", "Операции — учебный контур"),
            ("DEMO-IT", "ИТ — учебный контур"),
        )
        existing = set(
            (
                await session.scalars(
                    select(Department.code).where(
                        Department.code.in_([code for code, _ in demo_units])
                    )
                )
            ).all()
        )
        missing = [
            Department(code=code, name=name, isActive=True)
            for code, name in demo_units
            if code not in existing
        ]
        session.add_all(missing)
        await session.flush()
        return {"departmentsCreated": len(missing)}


class VerifyDataService:
    """Read-only relational consistency checks used by the verify-data CLI."""

    async def verify(self, session: AsyncSession) -> dict[str, int]:
        holding_totals = (
            select(AssetHolding.assetId, func.sum(AssetHolding.quantity).label("qty"))
            .group_by(AssetHolding.assetId)
            .subquery()
        )
        holding_mismatch = await session.scalar(
            select(func.count())
            .select_from(Asset)
            .outerjoin(holding_totals, holding_totals.c.assetId == Asset.id)
            .where(func.coalesce(holding_totals.c.qty, 0) != Asset.quantity)
        )
        orphan_holdings = await session.scalar(
            select(func.count())
            .select_from(AssetHolding)
            .outerjoin(Asset, Asset.id == AssetHolding.assetId)
            .where(Asset.id.is_(None))
        )
        doc_mismatch = await session.scalar(
            select(func.count())
            .select_from(Document)
            .outerjoin(
                DocumentVersion,
                (DocumentVersion.documentId == Document.id)
                & (DocumentVersion.versionNumber == Document.currentVersion),
            )
            .where(DocumentVersion.id.is_(None))
        )
        negative_assets = await session.scalar(
            select(func.count())
            .select_from(Asset)
            .where((Asset.quantity < 0) | (Asset.unitPrice < 0) | (Asset.totalCost < 0))
        )
        negative_holdings = await session.scalar(
            select(func.count()).select_from(AssetHolding).where(AssetHolding.quantity < 0)
        )
        secret_audit = await session.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(func.coalesce(AuditLog.details.cast(String), "").ilike("%temporaryPassword%"))
        )
        return {
            "holdingMismatch": int(holding_mismatch or 0),
            "orphanHoldings": int(orphan_holdings or 0),
            "documentCurrentVersionMismatch": int(doc_mismatch or 0),
            "negativeAssets": int(negative_assets or 0),
            "negativeHoldings": int(negative_holdings or 0),
            "secretAuditRows": int(secret_audit or 0),
        }
