"Сценарии импорта активов из XLSX и проверка строк, совместимая с прежней реализацией."

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import cast

import anyio

from app.core.context import Actor, RequestContext
from app.domain.assets.importing import (
    MAX_ASSET_IMPORT_FILE_BYTES,
    AssetWorkbookFormatError,
    ParsedAssetImportRow,
)
from app.domain.auth.rules import require_permission
from app.domain.errors import DomainError
from app.domain.ports.asset_workbooks import AssetWorkbookPort
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.assets import AssetService, check_mols, create_asset_in_uow
from app.services.dto.assets import AssetCommand


class AssetImportError(Exception):
    "Файл нельзя использовать для предварительного просмотра импорта активов."


def _authorize(actor: Actor, permission: str) -> None:
    if not actor.is_authenticated or actor.access is None:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    if actor.must_change_password:
        raise DomainError("PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403)
    require_permission(actor.access, permission)


_FIELD_LABELS = {
    "name": "Наименование",
    "inventoryNumber": "Инвентарный номер",
    "unitPrice": "Цена за единицу",
    "unitOfMeasure": "Единица измерения",
    "quantity": "Количество",
    "molId": "МОЛ",
    "groupId": "Группа",
    "recordingDate": "Дата поступления",
    "documentType": "Тип документа",
    "documentDetails": "Реквизиты документа",
    "accountingForm": "Форма учета",
    "contractCode": "Код договора",
    "internalFundingCode": "Код источника финансирования",
    "notes": "Примечание",
}


def _cell_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _decimal(value: object) -> Decimal | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        text = str(value)
    else:
        text = _cell_text(value).replace("\u00a0", "").replace(" ", "").replace(",", ".")
    if not text:
        return None
    try:
        number = Decimal(text)
    except InvalidOperation:
        return None
    return number if number.is_finite() else None


def _decimal_places(value: object) -> int:
    number = _decimal(value)
    if number is None:
        return 0
    exponent = number.as_tuple().exponent
    return max(0, -exponent) if isinstance(exponent, int) else 0


def _date_value(value: object) -> str:
    parsed: date | None = None
    if isinstance(value, datetime):
        parsed = value.astimezone(UTC).date() if value.tzinfo else value.date()
    elif isinstance(value, date):
        parsed = value
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            parsed = (
                datetime(1899, 12, 30) + timedelta(seconds=round(float(value) * 86_400))
            ).date()
        except (OverflowError, ValueError):
            return ""
    else:
        text = _cell_text(value)
        match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", text)
        if match:
            parts = int(match[1]), int(match[2]), int(match[3])
        else:
            local = re.fullmatch(r"(\d{1,2})[./](\d{1,2})[./](\d{4})", text)
            if not local:
                return ""
            parts = int(local[3]), int(local[2]), int(local[1])
        try:
            parsed = date(*parts)
        except ValueError:
            return ""
    return parsed.isoformat() if parsed is not None else ""


def _validation_message(field: str, message: str) -> str:
    return f"{_FIELD_LABELS.get(field, field)}: {message}"


_REQUIRED_MESSAGES = {
    "name": "Наименование обязательно",
    "inventoryNumber": "Инвентарный номер обязателен",
    "unitOfMeasure": "Единица измерения обязательна",
    "documentType": "Тип документа обязателен",
    "documentDetails": "Данные документа обязательны",
}


def _candidate(
    row: ParsedAssetImportRow, mol_id: str, group_id: str
) -> tuple[dict[str, object], list[str]]:
    values = row.values
    errors: list[str] = []
    strings = {
        "inventoryNumber": _cell_text(values.get("inventoryNumber")),
        "name": _cell_text(values.get("name")),
        "unitOfMeasure": _cell_text(values.get("unitOfMeasure")),
        "documentType": _cell_text(values.get("documentType")),
        "documentDetails": _cell_text(values.get("documentDetails")),
        "contractCode": _cell_text(values.get("contractCode")),
        "internalFundingCode": _cell_text(values.get("internalFundingCode")),
        "notes": _cell_text(values.get("notes")),
    }

    def required(field: str, maximum: int) -> None:
        value = strings[field]
        if not value:
            errors.append(_validation_message(field, _REQUIRED_MESSAGES[field]))
        elif len(value) > maximum:
            errors.append(
                _validation_message(
                    field, f"Too big: expected string to have <= {maximum} characters"
                )
            )

    required("name", 500)
    required("inventoryNumber", 100)
    required("unitOfMeasure", 50)
    required("documentType", 200)
    required("documentDetails", 500)
    for field, maximum in (("contractCode", 100), ("internalFundingCode", 100), ("notes", 2000)):
        if len(strings[field]) > maximum:
            errors.append(
                _validation_message(
                    field, f"Too big: expected string to have <= {maximum} characters"
                )
            )

    unit_price = _decimal(values.get("unitPrice"))
    quantity = _decimal(values.get("quantity"))
    extra_errors: list[str] = []
    if _decimal_places(values.get("unitPrice")) > 2:
        extra_errors.append("Цена за единицу: допустимо не более двух знаков после запятой")
    if _decimal_places(values.get("quantity")) > 2:
        extra_errors.append("Количество: допустимо не более двух знаков после запятой")
    if unit_price is None:
        price_error = (
            "укажите число" if _cell_text(values.get("unitPrice")) else "обязательное поле"
        )
        extra_errors.append(f"Цена за единицу: {price_error}")
    elif unit_price <= 0:
        errors.append(_validation_message("unitPrice", "Цена должна быть больше нуля"))
    if quantity is None:
        quantity_error = (
            "укажите число" if _cell_text(values.get("quantity")) else "обязательное поле"
        )
        extra_errors.append(f"Количество: {quantity_error}")
    elif quantity <= 0:
        errors.append(_validation_message("quantity", "Количество должно быть больше нуля"))
    if unit_price is not None and unit_price > Decimal("99999999.99"):
        extra_errors.append("Цена за единицу: превышен допустимый предел")
    if quantity is not None and quantity > Decimal("99999999.99"):
        extra_errors.append("Количество: превышен допустимый предел")
    if (
        unit_price is not None
        and quantity is not None
        and unit_price * quantity > Decimal("9999999999.99")
    ):
        extra_errors.append("Стоимость: цена × количество превышает допустимый предел")

    existing_text = _cell_text(values.get("isExistingAsset")).lower()
    if not existing_text or existing_text in {"нет", "no", "false", "0"}:
        is_existing = False
    elif existing_text in {"да", "yes", "true", "1"}:
        is_existing = True
    else:
        is_existing = False
        extra_errors.append("Ранее учтённое имущество: укажите «Да» или «Нет»")

    accounting_form = strings.get("accountingForm") or "145"
    if accounting_form not in {"145", "367"}:
        errors.append("Форма учета: укажите 145 или 367")
    recording_date = _date_value(values.get("recordingDate"))
    if not recording_date:
        errors.append(_validation_message("recordingDate", "Дата поступления обязательна"))

    candidate: dict[str, object] = {
        "inventoryNumber": strings["inventoryNumber"],
        "name": strings["name"],
        "unitPrice": float(unit_price if unit_price is not None else Decimal(0)),
        "unitOfMeasure": strings["unitOfMeasure"],
        "quantity": float(quantity if quantity is not None else Decimal(0)),
        "molId": mol_id,
        "groupId": group_id,
        "recordingDate": recording_date,
        "documentType": strings["documentType"],
        "documentDetails": strings["documentDetails"],
        "isExistingAsset": is_existing,
        "accountingForm": accounting_form,
        "projectId": None,
        "status": "IN_STOCK",
        "documentFiles": [],
        "photos": [],
    }
    for optional in ("contractCode", "internalFundingCode", "notes"):
        if strings[optional]:
            candidate[optional] = strings[optional]
    return candidate, errors + extra_errors


class AssetImportService:
    def __init__(
        self, factory: UnitOfWorkFactory[UnitOfWork], workbooks: AssetWorkbookPort
    ) -> None:
        self._factory = factory
        self._workbooks = workbooks
        self._asset_service = AssetService(factory)

    def parse_workbook(self, payload: bytes) -> tuple[ParsedAssetImportRow, ...]:
        if len(payload) > MAX_ASSET_IMPORT_FILE_BYTES:
            raise AssetImportError("Файл слишком большой. Максимальный размер — 5 МБ")
        try:
            return self._workbooks.parse_workbook(payload)
        except AssetWorkbookFormatError as error:
            raise AssetImportError(str(error)) from error

    async def preview(
        self, rows: tuple[ParsedAssetImportRow, ...], context: RequestContext
    ) -> list[dict[str, object]]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        _authorize(actor, "assets.create")
        async with self._factory() as uow:
            allowed = actor.access.allowed_department_ids("assets.create")
            mols = await uow.assets.mol_options(allowed)
            groups = await uow.groups.list()
            mol_by_code = {str(mol["code"]): mol for mol in mols}
            group_by_code = {group.code: group for group in groups}
            previews: list[dict[str, object]] = []
            rows_by_number: dict[str, list[int]] = defaultdict(list)

            for row in rows:
                mol_code = _cell_text(row.values.get("molCode"))
                group_code = _cell_text(row.values.get("groupCode"))
                mol = mol_by_code.get(mol_code) if 0 < len(mol_code) <= 50 else None
                group = group_by_code.get(group_code) if 0 < len(group_code) <= 50 else None
                has_mol_access = bool(
                    mol
                    and actor.access.allows("assets.create", {"departmentId": mol["departmentId"]})
                )
                candidate, errors = _candidate(
                    row,
                    str(mol["id"]) if mol else "__unavailable__",
                    group.id if group else "__unavailable__",
                )
                if not mol or not has_mol_access:
                    errors.append("МОЛ с таким кодом не найден или недоступен")
                if not group:
                    errors.append("Группа имущества не найдена")
                inventory_number = _cell_text(row.values.get("inventoryNumber"))
                if inventory_number:
                    rows_by_number[inventory_number].append(row.rowNumber)
                preview: dict[str, object] = {
                    "rowNumber": row.rowNumber,
                    "inventoryNumber": inventory_number,
                    "name": _cell_text(row.values.get("name")),
                    "molCode": mol_code,
                    "groupCode": group_code,
                    "quantity": _cell_text(row.values.get("quantity")),
                    "unitPrice": _cell_text(row.values.get("unitPrice")),
                    "unitOfMeasure": _cell_text(row.values.get("unitOfMeasure")),
                    "errors": errors,
                }
                if not errors and mol and has_mol_access and group:
                    preview["input"] = candidate
                previews.append(preview)

            eligible_numbers = {
                str(row["inventoryNumber"])
                for row in previews
                if 0 < len(str(row["inventoryNumber"])) <= 100
            }
            existing_numbers = await uow.assets.existing_numbers(sorted(eligible_numbers))
            duplicate_rows = {
                row_number
                for row_numbers in rows_by_number.values()
                if len(row_numbers) > 1
                for row_number in row_numbers
            }
            for preview in previews:
                number = str(preview["inventoryNumber"])
                errors = list(cast(list[str], preview["errors"]))
                if cast(int, preview["rowNumber"]) in duplicate_rows:
                    errors.append("Инвентарный номер повторяется в этом файле")
                if number in existing_numbers:
                    errors.append("Инвентарный номер уже используется")
                if errors:
                    preview.pop("input", None)
                    preview["errors"] = list(dict.fromkeys(errors))
            return previews

    async def _validate_commands(
        self,
        uow: UnitOfWork,
        commands: tuple[AssetCommand, ...],
        context: RequestContext,
    ) -> dict[int, list[str]]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        rows_by_number: dict[str, list[int]] = defaultdict(list)
        for index, command in enumerate(commands, start=2):
            rows_by_number[command.inventoryNumber].append(index)
        numbers = [number for number in rows_by_number if 0 < len(number) <= 100]
        existing_numbers = await uow.assets.existing_numbers(numbers)
        mols = await uow.assets.mol_options(actor.access.allowed_department_ids("assets.create"))
        mol_ids = {str(mol["id"]) for mol in mols}
        groups = {group.id for group in await uow.groups.list()}
        errors: dict[int, list[str]] = {}

        def add(row_number: int, message: str) -> None:
            errors.setdefault(row_number, []).append(message)

        for row_number, command in enumerate(commands, start=2):
            if command.molId not in mol_ids:
                add(row_number, "МОЛ с таким кодом не найден или недоступен")
            if command.groupId not in groups:
                add(row_number, "Группа имущества не найдена")
            if command.inventoryNumber in existing_numbers:
                add(row_number, "Инвентарный номер уже используется")
        for row_numbers in rows_by_number.values():
            if len(row_numbers) > 1:
                for row_number in row_numbers:
                    add(row_number, "Инвентарный номер повторяется в этом файле")
        return errors

    async def commit(self, commands: tuple[AssetCommand, ...], context: RequestContext) -> int:
        async def work(uow: UnitOfWork, actor: Actor) -> int:
            validation_errors = await self._validate_commands(uow, commands, context)
            if validation_errors:
                details = {
                    f"строка {row_number}": row_errors
                    for row_number, row_errors in validation_errors.items()
                }
                raise DomainError(
                    "ASSET_IMPORT_REVIEW_REQUIRED",
                    "Данные изменились или обнаружена ошибка. Загрузите файл заново и "
                    "проверьте предварительный просмотр",
                    409,
                    details,
                )
            for command in commands:
                # Пользователь уже проверен; createMany остаётся в этой единице работы.
                await check_mols(uow, actor, "assets.create", (command.molId,))
                await create_asset_in_uow(command, context, uow)
            return len(commands)

        return await self._asset_service.mutate(context, "assets.create", work)

    async def template(self, context: RequestContext) -> bytes:
        actor = context.actor
        assert actor is not None and actor.access is not None
        _authorize(actor, "assets.create")
        async with self._factory() as uow:
            mols = await uow.assets.mol_options(
                actor.access.allowed_department_ids("assets.create")
            )
            groups = await uow.groups.list()
            mol_values = sorted(mols, key=lambda mol: str(mol["code"]))
            group_values = sorted(groups, key=lambda group: group.code)
            references = [
                {
                    "code": mol.get("code"),
                    "fullName": mol.get("fullName"),
                    "department": mol.get("department"),
                }
                for mol in mol_values
            ]
            group_references = [{"code": group.code, "name": group.name} for group in group_values]
        return await anyio.to_thread.run_sync(
            self._workbooks.build_import_template, references, group_references
        )
