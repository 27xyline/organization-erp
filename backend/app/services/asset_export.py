"Экспорт XLSX в соответствии с контрактами прежних книг активов и операций."

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, date, datetime
from decimal import Decimal

import anyio

from app.core.context import Actor
from app.domain.auth.rules import require_permission
from app.domain.errors import DomainError
from app.domain.ports.asset_workbooks import AssetWorkbookPort
from app.domain.ports.assets import AssetRecord
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory


def _authorize(actor: Actor, permission: str) -> None:
    if not actor.is_authenticated or actor.access is None:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    if actor.must_change_password:
        raise DomainError("PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403)
    require_permission(actor.access, permission)


ASSET_HEADERS = (
    "ID",
    "№ п/п",
    "Наименование",
    "Инвентарный номер",
    "Группа",
    "МОЛ",
    "Подразделение",
    "Место хранения",
    "Цена за ед.",
    "Ед. изм.",
    "Количество",
    "Общая стоимость",
    "Статус",
    "Дата постановки на баланс",
    "Вид документа",
    "Реквизиты документа",
    "Код договора",
    "Код финансирования",
    "Существующее имущество",
    "В архиве",
    "Плановая дата списания",
    "Причина планового списания",
    "Примечания",
    "Количество файлов",
    "Количество фото",
    "Дата создания",
    "Дата обновления",
)

OPERATION_HEADERS = (
    "ID операции",
    "Тип операции",
    "Наименование объекта",
    "Инвентарный номер",
    "Группа",
    "От кого (МОЛ)",
    "Кому (МОЛ)",
    "Количество",
    "Цена за ед.",
    "Общая стоимость",
    "Дата операции",
    "Основание",
    "Вид документа",
    "Реквизиты документа",
    "Старый статус",
    "Новый статус",
    "Дата создания записи",
)

_STATUS_LABELS = {
    "IN_STOCK": "В наличии",
    "IN_USE": "В эксплуатации",
    "UNDER_REPAIR": "На ремонте",
    "PLANNED_FOR_DISPOSAL": "К списанию",
    "PARTIALLY_DISPOSED": "Частично списан",
    "FULLY_DISPOSED": "Полностью списан",
}
_OPERATION_LABELS = {
    "RECEIPT": "Приход",
    "TRANSFER": "Передача",
    "DISPOSAL": "Списание",
    "STATUS_CHANGE": "Изменение статуса",
}


def _date_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        normalized = value.astimezone(UTC) if value.tzinfo else value
        current = normalized.date()
    elif isinstance(value, date):
        current = value
    elif isinstance(value, str):
        try:
            current = datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except ValueError:
            return ""
    else:
        return ""
    return current.strftime("%d.%m.%Y")


def _mol_description(holdings: object) -> tuple[str, str, str]:
    mols: list[dict[str, object]] = []
    if isinstance(holdings, (tuple, list)):
        for holding in holdings:
            if isinstance(holding, Mapping) and isinstance(holding.get("mol"), Mapping):
                mols.append({**holding["mol"], "quantity": holding.get("quantity")})
            else:
                mol = getattr(holding, "mol", None)
                if isinstance(mol, Mapping):
                    mols.append({**mol, "quantity": getattr(holding, "quantity", "")})
    return (
        "; ".join(f"{mol.get('fullName', '')} ({mol.get('quantity', '')})" for mol in mols),
        "; ".join(dict.fromkeys(str(mol.get("department", "")) for mol in mols)),
        "; ".join(dict.fromkeys(str(mol.get("storageLocation", "")) for mol in mols)),
    )


def _asset_row(asset: AssetRecord) -> dict[str, object]:
    relation = asset.group or {}
    mol_text, departments, locations = _mol_description(asset.holdings or ())
    return {
        "ID": asset.id,
        "№ п/п": asset.orderNumber,
        "Наименование": asset.name,
        "Инвентарный номер": asset.inventoryNumber,
        "Группа": relation.get("name", ""),
        "МОЛ": mol_text,
        "Подразделение": departments,
        "Место хранения": locations,
        "Цена за ед.": float(asset.unitPrice),
        "Ед. изм.": asset.unitOfMeasure,
        "Количество": float(asset.quantity),
        "Общая стоимость": float(asset.totalCost),
        "Статус": _STATUS_LABELS.get(asset.status, asset.status),
        "Дата постановки на баланс": _date_text(asset.recordingDate),
        "Вид документа": asset.documentType,
        "Реквизиты документа": asset.documentDetails,
        "Код договора": asset.contractCode or "",
        "Код финансирования": asset.internalFundingCode or "",
        "Существующее имущество": "Да" if asset.isExistingAsset else "Нет",
        "В архиве": "Да" if asset.isArchived else "Нет",
        "Плановая дата списания": _date_text(asset.plannedDisposalDate),
        "Причина планового списания": asset.plannedDisposalReason or "",
        "Примечания": asset.notes or "",
        "Количество файлов": len(asset.documentFiles or []),
        "Количество фото": len(asset.photos or []),
        "Дата создания": _date_text(asset.createdAt),
        "Дата обновления": _date_text(asset.updatedAt),
    }


def _operation_row(operation: dict[str, object]) -> dict[str, object]:
    asset = operation.get("asset")
    asset = asset if isinstance(asset, dict) else {}
    group = asset.get("group")
    group = group if isinstance(group, dict) else {}
    from_mol = operation.get("fromMol")
    from_mol = from_mol if isinstance(from_mol, dict) else {}
    to_mol = operation.get("toMol")
    to_mol = to_mol if isinstance(to_mol, dict) else {}
    old_status = operation.get("oldStatus")
    new_status = operation.get("newStatus")
    return {
        "ID операции": operation.get("id", ""),
        "Тип операции": _OPERATION_LABELS.get(
            str(operation.get("type", "")), operation.get("type", "")
        ),
        "Наименование объекта": asset.get("name", ""),
        "Инвентарный номер": asset.get("inventoryNumber", ""),
        "Группа": group.get("name", ""),
        "От кого (МОЛ)": from_mol.get("fullName") or "-",
        "Кому (МОЛ)": to_mol.get("fullName") or "-",
        "Количество": _number(operation.get("quantity")),
        "Цена за ед.": _number(operation.get("unitPrice")),
        "Общая стоимость": _number(operation.get("totalCost")),
        "Дата операции": _date_text(operation.get("date")),
        "Основание": operation.get("reason") or "-",
        "Вид документа": operation.get("documentType", ""),
        "Реквизиты документа": operation.get("documentDetails", ""),
        "Старый статус": (
            _STATUS_LABELS.get(str(old_status), str(old_status)) if old_status else "-"
        ),
        "Новый статус": (
            _STATUS_LABELS.get(str(new_status), str(new_status)) if new_status else "-"
        ),
        "Дата создания записи": _date_text(operation.get("createdAt")),
    }


def _number(value: object) -> float:
    if isinstance(value, (int, float, Decimal, str)):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


class AssetExportService:
    def __init__(
        self, factory: UnitOfWorkFactory[UnitOfWork], workbooks: AssetWorkbookPort
    ) -> None:
        self._factory = factory
        self._workbooks = workbooks

    async def export(self, kind: str, actor: Actor, filters: dict[str, str]) -> tuple[bytes, str]:
        _authorize(actor, "assets.export")
        assert actor.access is not None
        today = datetime.now(UTC).date().isoformat()
        async with self._factory() as uow:
            if kind == "assets":
                archived = None if "archived" not in filters else filters["archived"] == "true"
                assets = await uow.assets.export_assets(archived, actor.access)
                headers: tuple[str, ...] = ASSET_HEADERS
                rows = [_asset_row(asset) for asset in assets]
                filename = f"assets_export_{today}.xlsx"
            elif kind == "operations":
                operations = await uow.assets.export_operations(actor.access)
                headers = OPERATION_HEADERS
                rows = [_operation_row(operation) for operation in operations]
                filename = f"operations_export_{today}.xlsx"
            else:
                raise DomainError("UNSUPPORTED_EXPORT_TYPE", "Неизвестный тип экспорта", 422)
        content = await anyio.to_thread.run_sync(self._workbooks.build_export, headers, rows)
        return content, filename
