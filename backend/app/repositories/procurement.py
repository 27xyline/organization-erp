"""Сохранение данных закупок через SQLAlchemy; каждая операция повторно \
использует сессию своего UoW."""

from collections.abc import Callable
from typing import Any, cast

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql import Select

from app.domain.errors import PersistenceConflict
from app.models.catalogs import AssetGroup, Mol, Supplier
from app.models.procurement import (
    ProcurementContract,
    ProcurementDelivery,
    ProcurementDeliveryItem,
    ProcurementItem,
    ProcurementRequest,
)
from app.models.projects import Project
from app.models.users import User


async def _flush(session: AsyncSession) -> None:
    try:
        await session.flush()
    except IntegrityError as error:
        original: Any = error.orig
        visited: set[int] = set()
        while original is not None and id(original) not in visited:
            visited.add(id(original))
            constraint = getattr(original, "constraint_name", None)
            if constraint:
                raise PersistenceConflict(str(constraint)) from error
            constraint = getattr(getattr(original, "diag", None), "constraint_name", None)
            if constraint:
                raise PersistenceConflict(str(constraint)) from error
            original = getattr(original, "orig", None) or getattr(original, "__cause__", None)
        raise


class SqlAlchemyProcurementRepository:
    def __init__(self, session: Callable[[], AsyncSession]) -> None:
        self._session = session

    def _request_query(self) -> Select[ProcurementRequest]:
        return select(ProcurementRequest).options(
            selectinload(ProcurementRequest.project),
            selectinload(ProcurementRequest.requestedBy),
            selectinload(ProcurementRequest.document),
            selectinload(ProcurementRequest.approvalRequest),
            selectinload(ProcurementRequest.items).selectinload(ProcurementItem.group),
            selectinload(ProcurementRequest.items)
            .selectinload(ProcurementItem.deliveryItems)
            .selectinload(ProcurementDeliveryItem.asset),
            selectinload(ProcurementRequest.contract).selectinload(ProcurementContract.supplier),
            selectinload(ProcurementRequest.contract).selectinload(ProcurementContract.document),
            selectinload(ProcurementRequest.deliveries).selectinload(ProcurementDelivery.document),
            selectinload(ProcurementRequest.deliveries)
            .selectinload(ProcurementDelivery.items)
            .selectinload(ProcurementDeliveryItem.procurementItem),
            selectinload(ProcurementRequest.deliveries)
            .selectinload(ProcurementDelivery.items)
            .selectinload(ProcurementDeliveryItem.asset),
        )

    async def request(self, identifier: str, *, lock: bool = False) -> ProcurementRequest | None:
        query = self._request_query().where(ProcurementRequest.id == identifier)
        if lock:
            query = query.with_for_update()
        return cast(ProcurementRequest | None, await self._session().scalar(query))

    async def all_requests(self) -> list[ProcurementRequest]:
        result = await self._session().scalars(
            self._request_query().order_by(
                ProcurementRequest.updatedAt.desc(), ProcurementRequest.id.desc()
            )
        )
        return cast(list[ProcurementRequest], list(result.all()))

    async def create_request(
        self, values: dict[str, Any], items: list[dict[str, Any]]
    ) -> ProcurementRequest:
        row = ProcurementRequest(**values)
        self._session().add(row)
        await _flush(self._session())
        for values in items:
            self._session().add(ProcurementItem(requestId=row.id, **values))
        await _flush(self._session())
        return row

    async def replace_request(
        self, row: ProcurementRequest, values: dict[str, Any], items: list[dict[str, Any]]
    ) -> ProcurementRequest:
        for key, value in values.items():
            setattr(row, key, value)
        await _flush(self._session())
        await self._session().execute(
            delete(ProcurementItem).where(ProcurementItem.requestId == row.id)
        )
        for values in items:
            self._session().add(ProcurementItem(requestId=row.id, **values))
        await _flush(self._session())
        self._session().expire(row, ["items"])
        return (await self.request(row.id)) or row

    async def create_supplier(self, values: dict[str, Any]) -> Supplier:
        row = Supplier(**values)
        self._session().add(row)
        await _flush(self._session())
        return row

    async def update_request_values(self, identifier: str, values: dict[str, Any]) -> None:
        await self._session().execute(
            update(ProcurementRequest).where(ProcurementRequest.id == identifier).values(**values)
        )
        row = await self._session().get(ProcurementRequest, identifier)
        if row is not None:
            self._session().expire(row, ["approvalRequest"])

    async def references_exist(
        self, *, project_id: str | None, group_ids: tuple[str | None, ...]
    ) -> bool:
        if project_id:
            project = await self._session().scalar(
                select(Project.id).where(Project.id == project_id, Project.status == "ACTIVE")
            )
            if project is None:
                return False
        ids = tuple(dict.fromkeys(group_id for group_id in group_ids if group_id))
        if ids:
            found = await self._session().scalars(
                select(AssetGroup.id).where(AssetGroup.id.in_(ids))
            )
            if len(found.all()) != len(ids):
                return False
        return True

    async def supplier(self, identifier: str, *, active_only: bool = False) -> Supplier | None:
        query = select(Supplier).where(Supplier.id == identifier)
        if active_only:
            query = query.where(Supplier.isActive.is_(True))
        return await self._session().scalar(query)

    async def create_contract(self, values: dict[str, Any]) -> ProcurementContract:
        row = ProcurementContract(**values)
        self._session().add(row)
        await _flush(self._session())
        return row

    async def create_delivery(
        self, values: dict[str, Any], items: list[dict[str, Any]]
    ) -> ProcurementDelivery:
        row = ProcurementDelivery(**values)
        self._session().add(row)
        await _flush(self._session())
        for values in items:
            self._session().add(ProcurementDeliveryItem(deliveryId=row.id, **values))
        await _flush(self._session())
        request = await self._session().get(ProcurementRequest, row.requestId)
        if request is not None:
            self._session().expire(request, ["items", "deliveries"])
        existing_items = await self._session().scalars(
            select(ProcurementItem).where(ProcurementItem.requestId == row.requestId)
        )
        for item in existing_items:
            self._session().expire(item, ["deliveryItems"])
        return row

    async def delivery_item(
        self, identifier: str, *, lock: bool = False
    ) -> ProcurementDeliveryItem | None:
        query = (
            select(ProcurementDeliveryItem)
            .where(ProcurementDeliveryItem.id == identifier)
            .options(
                selectinload(ProcurementDeliveryItem.delivery)
                .selectinload(ProcurementDelivery.request)
                .selectinload(ProcurementRequest.contract),
                selectinload(ProcurementDeliveryItem.procurementItem),
            )
        )
        if lock:
            query = query.with_for_update()
        return await self._session().scalar(query)

    async def set_request_status(self, request_id: str, status: str) -> None:
        await self._session().execute(
            update(ProcurementRequest)
            .where(ProcurementRequest.id == request_id)
            .values(status=status)
        )

    async def sum_delivered(self, item_ids: tuple[str, ...]) -> dict[str, Any]:
        if not item_ids:
            return {}
        rows = await self._session().execute(
            select(
                ProcurementDeliveryItem.procurementItemId,
                func.sum(ProcurementDeliveryItem.quantity),
            )
            .where(ProcurementDeliveryItem.procurementItemId.in_(item_ids))
            .group_by(ProcurementDeliveryItem.procurementItemId)
        )
        return {item_id: amount for item_id, amount in rows.all()}

    async def link_delivery_asset(self, delivery_item_id: str, asset_id: str) -> bool:
        result = await self._session().execute(
            update(ProcurementDeliveryItem)
            .where(
                ProcurementDeliveryItem.id == delivery_item_id,
                ProcurementDeliveryItem.assetId.is_(None),
            )
            .values(assetId=asset_id)
        )
        return bool(cast(Any, result).rowcount == 1)

    async def uncapitalized_delivery_item_count(self, request_id: str) -> int:
        return int(
            await self._session().scalar(
                select(func.count(ProcurementDeliveryItem.id)).where(
                    ProcurementDeliveryItem.assetId.is_(None),
                    ProcurementDeliveryItem.deliveryId.in_(
                        select(ProcurementDelivery.id).where(
                            ProcurementDelivery.requestId == request_id
                        )
                    ),
                )
            )
            or 0
        )

    async def options(self) -> dict[str, list[dict[str, Any]]]:
        session = self._session()
        projects = await session.execute(
            select(Project.id, Project.code, Project.name)
            .where(Project.status == "ACTIVE")
            .order_by(Project.code)
        )
        suppliers = await session.execute(
            select(Supplier.id, Supplier.name, Supplier.taxId)
            .where(Supplier.isActive.is_(True))
            .order_by(Supplier.name)
        )
        approvers = await session.execute(
            select(User.id, User.name, User.username)
            .where(User.isActive.is_(True))
            .order_by(User.name)
        )
        groups = await session.execute(
            select(AssetGroup.id, AssetGroup.code, AssetGroup.name).order_by(AssetGroup.code)
        )
        mols = await session.execute(
            select(Mol.id, Mol.code, Mol.fullName, Mol.storageLocation, Mol.departmentId).order_by(
                Mol.code
            )
        )
        return {
            "projects": [dict(row._mapping) for row in projects],
            "suppliers": [dict(row._mapping) for row in suppliers],
            "approvers": [dict(row._mapping) for row in approvers],
            "groups": [dict(row._mapping) for row in groups],
            "mols": [dict(row._mapping) for row in mols],
            "documents": [],
        }
