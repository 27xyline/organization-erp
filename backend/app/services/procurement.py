"""Procurement use cases with approvals, assets, audit and receipts in one UoW."""

from __future__ import annotations

import builtins
from datetime import UTC, datetime, time
from decimal import Decimal
from typing import Any, NoReturn, cast

from app.core.context import RequestContext
from app.domain.documents.records import DocumentFilter
from app.domain.enums import ApprovalRequestStatus
from app.domain.errors import DomainError, PersistenceConflict
from app.domain.ports.audit import AuditRecord, JsonValue
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.models.enums import ProcurementStatus
from app.services.approvals import create_approval_in_uow
from app.services.assets import create_asset_in_uow
from app.services.catalogs import _authorize, _check_actor
from app.services.dto.approvals import ApprovalCommand, ApprovalStepCommand
from app.services.dto.assets import AssetCommand
from app.services.dto.procurement import (
    ProcurementCapitalizeCommand,
    ProcurementCommand,
    ProcurementContractCommand,
    ProcurementDeliveryCommand,
    ProcurementQuery,
    ProcurementSubmitCommand,
    SupplierCommand,
)

_ERRORS = {
    "NOT_FOUND": ("PROCUREMENT_NOT_FOUND", "Закупка или её этап не найдены", 404),
    "INVALID_STATE": (
        "INVALID_PROCUREMENT_STATE", "Действие недоступно на текущем этапе закупки", 409
    ),
    "REFERENCE_NOT_FOUND": ("REFERENCE_NOT_FOUND", "Связанный объект не найден", 422),
    "BUDGET_EXCEEDED": (
        "BUDGET_EXCEEDED", "Сумма договора превышает бюджетный лимит", 409
    ),
    "DELIVERY_EXCEEDED": (
        "DELIVERY_EXCEEDED", "Количество поставки превышает остаток по заявке", 409
    ),
    "ALREADY_CAPITALIZED": ("ALREADY_CAPITALIZED", "Позиция уже поставлена на учёт", 409),
}


def _fail(code: str) -> NoReturn:
    public_code, message, status = _ERRORS[code]
    raise DomainError(public_code, message, status)


def _persistence_error(error: PersistenceConflict) -> NoReturn:
    code, message = {
        "procurement_requests_number_key": (
            "PROCUREMENT_NUMBER_EXISTS", "Номер заявки уже используется"
        ),
        "suppliers_taxId_key": (
            "SUPPLIER_TAX_ID_EXISTS", "Поставщик с таким ИНН уже существует"
        ),
        "procurement_contracts_number_key": (
            "CONTRACT_NUMBER_EXISTS", "Номер договора уже используется"
        ),
        "procurement_deliveries_contractId_number_key": (
            "DELIVERY_NUMBER_EXISTS", "Номер поставки уже используется для договора"
        ),
        "assets_inventoryNumber_key": (
            "INVENTORY_NUMBER_EXISTS", "Инвентарный номер уже используется"
        ),
    }.get(error.constraint, ("PERSISTENCE_CONFLICT", "Конфликт сохранения данных"))
    raise DomainError(code, message, 409) from error


def _effective_status(request: Any) -> str:
    if request.status != ProcurementStatus.SUBMITTED:
        return str(request.status)
    approval = request.approvalRequest
    if approval is None:
        return str(request.status)
    return str({
        ApprovalRequestStatus.APPROVED: ProcurementStatus.APPROVED,
        ApprovalRequestStatus.REJECTED: ProcurementStatus.REJECTED,
        ApprovalRequestStatus.CANCELLED: ProcurementStatus.CANCELLED,
    }.get(approval.status, request.status).value)


def _serialize(request: Any) -> dict[str, Any]:
    items = []
    total = Decimal(0)
    for item in request.items:
        delivered = sum((line.quantity for line in item.deliveryItems), Decimal(0))
        total += item.quantity * item.unitPrice
        items.append(
            {
                "id": item.id,
                "requestId": item.requestId,
                "name": item.name,
                "quantity": item.quantity,
                "unit": item.unit,
                "unitPrice": item.unitPrice,
                "groupId": item.groupId,
                "createdAt": item.createdAt,
                "updatedAt": item.updatedAt,
                "group": (
                    {"id": item.group.id, "code": item.group.code, "name": item.group.name}
                    if item.group
                    else None
                ),
                "deliveredQuantity": delivered,
                "deliveryItems": [
                    {"id": line.id, "quantity": line.quantity, "assetId": line.assetId,
                     "createdAt": line.createdAt, "updatedAt": line.updatedAt}
                    for line in item.deliveryItems
                ],
            }
        )
    contract = request.contract
    deliveries = []
    for delivery in request.deliveries:
        deliveries.append(
            {
                "id": delivery.id,
                "requestId": delivery.requestId,
                "contractId": delivery.contractId,
                "number": delivery.number,
                "receivedAt": delivery.receivedAt,
                "note": delivery.note,
                "documentId": delivery.documentId,
                "document": _document(delivery.document),
                "createdAt": delivery.createdAt,
                "updatedAt": delivery.updatedAt,
                "items": [
                    {
                        "id": line.id,
                        "quantity": line.quantity,
                        "assetId": line.assetId,
                        "createdAt": line.createdAt,
                        "updatedAt": line.updatedAt,
                        "procurementItem": {
                            "id": line.procurementItem.id,
                            "name": line.procurementItem.name,
                            "unit": line.procurementItem.unit,
                            "unitPrice": line.procurementItem.unitPrice,
                        },
                        "asset": (
                            {"id": line.asset.id, "inventoryNumber": line.asset.inventoryNumber,
                             "name": line.asset.name}
                            if line.asset
                            else None
                        ),
                    }
                    for line in delivery.items
                ],
            }
        )
    return {
        "id": request.id,
        "number": request.number,
        "title": request.title,
        "description": request.description,
        "status": _effective_status(request),
        "budgetLimit": request.budgetLimit,
        "totalPlanned": total,
        "neededBy": request.neededBy,
        "projectId": request.projectId,
        "requestedById": request.requestedById,
        "documentId": request.documentId,
        "approvalRequestId": request.approvalRequestId,
        "project": (
            {"id": request.project.id, "code": request.project.code, "name": request.project.name}
            if request.project
            else None
        ),
        "requestedBy": {"id": request.requestedBy.id, "name": request.requestedBy.name},
        "document": _document(request.document),
        "approvalRequest": (
            {
                "id": request.approvalRequest.id,
                "status": request.approvalRequest.status,
                "currentStep": request.approvalRequest.currentStep,
            }
            if request.approvalRequest
            else None
        ),
        "items": items,
        "contract": (
            {
                "id": contract.id,
                "requestId": contract.requestId,
                "supplierId": contract.supplierId,
                "number": contract.number,
                "amount": contract.amount,
                "signedAt": contract.signedAt,
                "deliveryDueAt": contract.deliveryDueAt,
                "documentId": contract.documentId,
                "createdAt": contract.createdAt,
                "updatedAt": contract.updatedAt,
                "supplier": {
                    "id": contract.supplier.id,
                    "name": contract.supplier.name,
                    "taxId": contract.supplier.taxId,
                    "email": contract.supplier.email,
                    "phone": contract.supplier.phone,
                    "address": contract.supplier.address,
                    "isActive": contract.supplier.isActive,
                    "createdAt": contract.supplier.createdAt,
                    "updatedAt": contract.supplier.updatedAt,
                },
                "document": _document(contract.document),
            }
            if contract
            else None
        ),
        "deliveries": deliveries,
        "createdAt": request.createdAt,
        "updatedAt": request.updatedAt,
    }


def _document(document: Any | None) -> dict[str, Any] | None:
    if document is None:
        return None
    return {"id": document.id, "title": document.title, "status": document.status}


async def _audit(
    uow: UnitOfWork,
    context: RequestContext,
    action: str,
    entity_id: str,
    details: dict[str, str | int | bool | None],
) -> None:
    assert context.actor is not None
    await uow.audit.append(
        AuditRecord(
            action,
            "ProcurementRequest",
            entity_id,
            context.actor.actor_id,
            cast(dict[str, JsonValue], details),
            context.request_id,
        )
    )


class ProcurementService:
    def __init__(self, factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._factory = factory

    async def list(self, query: ProcurementQuery, context: RequestContext) -> dict[str, Any]:
        _authorize(context.actor, "procurement.read")  # type: ignore[arg-type]
        search = (query.search or "").casefold()
        now = datetime.now(UTC).date()
        matched: list[tuple[dict[str, Any], bool]] = []
        async with self._factory() as uow:
            rows = await uow.procurement.all_requests()
            for row in rows:
                item = _serialize(row)
                if query.status and item["status"] != query.status:
                    continue
                if search:
                    contract = row.contract
                    haystack = " ".join(
                        filter(None, (row.number, row.title,
                                      contract.number if contract else None,
                                      contract.supplier.name if contract else None))
                    ).casefold()
                    if search not in haystack:
                        continue
                due_at = item["contract"]["deliveryDueAt"] if item["contract"] else None
                overdue = bool(due_at and due_at < now) and item["status"] not in {
                    "DELIVERED", "CAPITALIZED", "REJECTED", "CANCELLED"
                }
                matched.append((item, overdue))
        active_status = {
            "DRAFT", "SUBMITTED", "APPROVED", "CONTRACTED", "PARTIALLY_DELIVERED", "DELIVERED"
        }
        summary = {
            "active": sum(item["status"] in active_status for item, _ in matched),
            "awaiting": sum(item["status"] == "SUBMITTED" for item, _ in matched),
            "overdue": sum(overdue for _, overdue in matched),
            "budget": sum((item["budgetLimit"] for item, _ in matched), Decimal(0)),
        }
        total = len(matched)
        start = (query.page - 1) * query.pageSize
        return {
            "requests": [item for item, _ in matched[start : start + query.pageSize]],
            "total": total,
            "summary": summary,
        }

    async def get(self, identifier: str, context: RequestContext) -> dict[str, Any]:
        _authorize(context.actor, "procurement.read")  # type: ignore[arg-type]
        async with self._factory() as uow:
            row = await uow.procurement.request(identifier)
            if row is None:
                _fail("NOT_FOUND")
            return _serialize(row)

    async def options(self, context: RequestContext) -> dict[str, Any]:
        _authorize(context.actor, "procurement.read")  # type: ignore[arg-type]
        assert context.actor is not None and context.actor.access is not None
        async with self._factory() as uow:
            result = await uow.procurement.options()
            allowed_departments = context.actor.access.allowed_department_ids("assets.create")
            if allowed_departments is not None:
                allowed = set(allowed_departments)
                result["mols"] = [
                    mol for mol in result["mols"] if mol["departmentId"] in allowed
                ]
            if context.actor.access.has("documents.read"):
                page = await uow.documents.list(
                    DocumentFilter(page=1, pageSize=200), context.actor.access
                )
                result["documents"] = [
                    {
                        "id": document.id,
                        "title": document.title,
                        "category": document.category,
                        "status": document.status,
                        "projectId": document.projectId,
                    }
                    for document in page.documents
                ]
            return result

    async def create(
        self, command: ProcurementCommand, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None
        _authorize(actor, "procurement.create")
        values, items = self._request_values(command, actor.actor_id)
        async with self._factory() as uow:
            await _check_actor(uow, actor)
            if not await uow.procurement.references_exist(
                project_id=command.projectId,
                group_ids=tuple(item.groupId for item in command.items),
            ):
                _fail("REFERENCE_NOT_FOUND")
            await self._check_document(uow, command.documentId, context)
            try:
                row = await uow.procurement.create_request(values, items)
            except PersistenceConflict as error:
                _persistence_error(error)
            await _audit(uow, context, "PROCUREMENT_CREATED", row.id,
                          {"number": row.number, "budgetLimit": str(row.budgetLimit)})
            result = _serialize(await uow.procurement.request(row.id))
            await uow.commit()
            return result

    async def update(
        self, identifier: str, command: ProcurementCommand, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None
        _authorize(actor, "procurement.update")
        values, items = self._request_values(command, actor.actor_id)
        values.pop("requestedById")
        values.pop("number")
        async with self._factory() as uow:
            await _check_actor(uow, actor)
            row = await uow.procurement.request(identifier, lock=True)
            if row is None:
                _fail("NOT_FOUND")
            if row.status != ProcurementStatus.DRAFT:
                _fail("INVALID_STATE")
            if not await uow.procurement.references_exist(
                project_id=command.projectId,
                group_ids=tuple(item.groupId for item in command.items),
            ):
                _fail("REFERENCE_NOT_FOUND")
            await self._check_document(uow, command.documentId, context)
            await uow.procurement.replace_request(row, values, items)
            await _audit(uow, context, "PROCUREMENT_UPDATED", identifier,
                          {"budgetLimit": str(command.budgetLimit), "itemCount": len(items)})
            result = _serialize(await uow.procurement.request(identifier))
            await uow.commit()
            return result

    async def submit(
        self, identifier: str, command: ProcurementSubmitCommand, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None
        _authorize(actor, "procurement.submit")
        async with self._factory() as uow:
            await _check_actor(uow, actor)
            row = await uow.procurement.request(identifier, lock=True)
            if row is None:
                _fail("NOT_FOUND")
            if row.status != ProcurementStatus.DRAFT or row.approvalRequestId:
                _fail("INVALID_STATE")
            approval = await create_approval_in_uow(
                ApprovalCommand(
                    title=f"Закупка {row.number}: {row.title}",
                    description=row.description,
                    entityType="ProcurementRequest",
                    entityId=row.id,
                    projectId=row.projectId,
                    documentId=row.documentId,
                    dueAt=command.dueAt,
                    steps=tuple(
                        ApprovalStepCommand(approver, name)
                        for name, approver in command.steps
                    ),
                ),
                context,
                uow,
            )
            await uow.procurement.update_request_values(
                identifier,
                {"approvalRequestId": approval["id"], "status": ProcurementStatus.SUBMITTED},
            )
            await _audit(uow, context, "PROCUREMENT_SUBMITTED", identifier,
                          {"approvalRequestId": approval["id"]})
            result = _serialize(await uow.procurement.request(identifier))
            await uow.commit()
            return result

    async def create_supplier(
        self, command: SupplierCommand, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None
        _authorize(actor, "procurement.suppliers.manage")
        async with self._factory() as uow:
            await _check_actor(uow, actor)
            try:
                supplier = await uow.procurement.create_supplier(
                    {"name": command.name, "taxId": command.taxId, "email": command.email,
                     "phone": command.phone, "address": command.address}
                )
            except PersistenceConflict as error:
                _persistence_error(error)
            await uow.audit.append(
                AuditRecord("SUPPLIER_CREATED", "Supplier", supplier.id, actor.actor_id,
                            {"name": supplier.name}, context.request_id)
            )
            await uow.commit()
            return {"id": supplier.id, "name": supplier.name, "taxId": supplier.taxId,
                    "email": supplier.email, "phone": supplier.phone, "address": supplier.address,
                    "isActive": supplier.isActive}

    async def create_contract(
        self, identifier: str, command: ProcurementContractCommand, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None
        _authorize(actor, "procurement.contract")
        async with self._factory() as uow:
            await _check_actor(uow, actor)
            row = await uow.procurement.request(identifier, lock=True)
            if row is None:
                _fail("NOT_FOUND")
            if (
                row.contract
                or not row.approvalRequest
                or row.approvalRequest.status != ApprovalRequestStatus.APPROVED
            ):
                _fail("INVALID_STATE")
            if command.amount > row.budgetLimit:
                _fail("BUDGET_EXCEEDED")
            supplier = await uow.procurement.supplier(command.supplierId, active_only=True)
            if supplier is None:
                _fail("REFERENCE_NOT_FOUND")
            await self._check_document(uow, command.documentId, context)
            try:
                await uow.procurement.create_contract(
                    {"requestId": identifier, "supplierId": command.supplierId,
                     "number": command.number, "amount": command.amount,
                     "signedAt": command.signedAt, "deliveryDueAt": command.deliveryDueAt,
                     "documentId": command.documentId}
                )
            except PersistenceConflict as error:
                _persistence_error(error)
            await uow.procurement.set_request_status(identifier, ProcurementStatus.CONTRACTED)
            await _audit(uow, context, "PROCUREMENT_CONTRACTED", identifier,
                          {"contractNumber": command.number, "supplierId": command.supplierId,
                           "amount": str(command.amount)})
            result = _serialize(await uow.procurement.request(identifier))
            await uow.commit()
            return result

    async def create_delivery(
        self, identifier: str, command: ProcurementDeliveryCommand, context: RequestContext
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None
        _authorize(actor, "procurement.deliver")
        async with self._factory() as uow:
            await _check_actor(uow, actor)
            row = await uow.procurement.request(identifier, lock=True)
            if row is None:
                _fail("NOT_FOUND")
            if row.contract is None or row.status not in {
                ProcurementStatus.CONTRACTED, ProcurementStatus.PARTIALLY_DELIVERED
            }:
                _fail("INVALID_STATE")
            await self._check_document(uow, command.documentId, context)
            ordered = {item.id: item.quantity for item in row.items}
            prior = {item.id: sum((line.quantity for line in item.deliveryItems), Decimal(0))
                     for item in row.items}
            incoming: dict[str, Decimal] = {}
            for line in command.items:
                incoming[line.procurementItemId] = incoming.get(
                    line.procurementItemId, Decimal(0)
                ) + line.quantity
            from app.domain.procurement.rules import validate_delivery_quantities

            try:
                fully_delivered = validate_delivery_quantities(ordered, prior, incoming)
            except ValueError as error:
                _fail(str(error))
            try:
                await uow.procurement.create_delivery(
                    {"requestId": identifier, "contractId": row.contract.id,
                     "number": command.number, "receivedAt": command.receivedAt,
                     "note": command.note, "documentId": command.documentId},
                    [
                        {"procurementItemId": item_id, "quantity": quantity}
                        for item_id, quantity in incoming.items()
                    ],
                )
            except PersistenceConflict as error:
                _persistence_error(error)
            status = (
                ProcurementStatus.DELIVERED if fully_delivered
                else ProcurementStatus.PARTIALLY_DELIVERED
            )
            await uow.procurement.set_request_status(identifier, status)
            await _audit(uow, context, "PROCUREMENT_DELIVERY_REGISTERED", identifier,
                          {"deliveryNumber": command.number, "fullyDelivered": fully_delivered})
            result = _serialize(await uow.procurement.request(identifier))
            await uow.commit()
            return result

    async def capitalize(
        self, delivery_item_id: str, command: ProcurementCapitalizeCommand,
        context: RequestContext,
    ) -> dict[str, Any]:
        actor = context.actor
        assert actor is not None
        _authorize(actor, "procurement.capitalize")
        async with self._factory() as uow:
            await _check_actor(uow, actor)
            line = await uow.procurement.delivery_item(delivery_item_id, lock=True)
            if line is None:
                _fail("NOT_FOUND")
            if line.assetId:
                _fail("ALREADY_CAPITALIZED")
            item = line.procurementItem
            group_id = command.groupId or item.groupId
            if not group_id:
                _fail("REFERENCE_NOT_FOUND")
            department_id = await uow.mols.department_target(command.molId)
            if department_id is None:
                _fail("REFERENCE_NOT_FOUND")
            _authorize(actor, "assets.create", {"departmentId": department_id})
            if await uow.groups.get(group_id) is None:
                _fail("REFERENCE_NOT_FOUND")
            request = line.delivery.request
            try:
                asset = await create_asset_in_uow(
                    AssetCommand(
                        name=item.name,
                        inventoryNumber=command.inventoryNumber,
                        unitPrice=item.unitPrice,
                        unitOfMeasure=item.unit,
                        quantity=line.quantity,
                        molId=command.molId,
                        groupId=group_id,
                        projectId=request.projectId,
                        contractCode=request.contract.number if request.contract else None,
                        internalFundingCode=request.number,
                        recordingDate=datetime.combine(line.delivery.receivedAt, time.min),
                        documentType="Акт поставки",
                        documentDetails=f"Поставка {line.delivery.number}",
                        notes=command.notes,
                        accountingForm=command.accountingForm,
                    ),
                    context,
                    uow,
                )
            except PersistenceConflict as error:
                _persistence_error(error)
            if not await uow.procurement.link_delivery_asset(delivery_item_id, asset.id):
                _fail("ALREADY_CAPITALIZED")
            if (
                await uow.procurement.uncapitalized_delivery_item_count(request.id) == 0
                and request.status == ProcurementStatus.DELIVERED
            ):
                await uow.procurement.set_request_status(request.id, ProcurementStatus.CAPITALIZED)
            await _audit(uow, context, "PROCUREMENT_CAPITALIZED", request.id,
                          {"deliveryItemId": delivery_item_id, "assetId": asset.id,
                           "inventoryNumber": asset.inventoryNumber})
            await uow.commit()
            return {"id": asset.id, "inventoryNumber": asset.inventoryNumber}

    async def _check_document(
        self, uow: UnitOfWork, document_id: str | None, context: RequestContext
    ) -> None:
        if not document_id:
            return
        assert context.actor is not None and context.actor.access is not None
        document = await uow.documents.get(
            document_id, context.actor.access, "documents.read", lock=True
        )
        if document is None:
            _fail("REFERENCE_NOT_FOUND")
        if document.status == "ARCHIVED":
            _fail("INVALID_STATE")

    @staticmethod
    def _request_values(
        command: ProcurementCommand, actor_id: str
    ) -> tuple[dict[str, Any], builtins.list[dict[str, Any]]]:
        return (
            {"number": command.number, "title": command.title,
             "description": command.description, "budgetLimit": command.budgetLimit,
             "neededBy": command.neededBy, "projectId": command.projectId,
             "documentId": command.documentId, "requestedById": actor_id},
            [{"name": item.name, "quantity": item.quantity, "unit": item.unit,
              "unitPrice": item.unitPrice, "groupId": item.groupId}
             for item in command.items],
        )
