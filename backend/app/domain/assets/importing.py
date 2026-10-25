"Чистый контракт формата файла для импорта активов из книги XLSX."

from __future__ import annotations

from dataclasses import dataclass

MAX_ASSET_IMPORT_ROWS = 100
MAX_ASSET_IMPORT_FILE_BYTES = 5 * 1024 * 1024


class AssetWorkbookFormatError(Exception):
    "Книга не соответствует контракту файла импорта активов."


@dataclass(frozen=True, slots=True)
class ImportColumn:
    key: str
    label: str
    required: bool = True


ASSET_IMPORT_COLUMNS = (
    ImportColumn("inventoryNumber", "Инвентарный номер"),
    ImportColumn("name", "Наименование"),
    ImportColumn("unitPrice", "Цена за единицу"),
    ImportColumn("unitOfMeasure", "Единица измерения"),
    ImportColumn("quantity", "Количество"),
    ImportColumn("molCode", "Код МОЛ"),
    ImportColumn("groupCode", "Код группы"),
    ImportColumn("recordingDate", "Дата поступления"),
    ImportColumn("documentType", "Тип документа"),
    ImportColumn("documentDetails", "Реквизиты документа"),
    ImportColumn("contractCode", "Код договора", required=False),
    ImportColumn("internalFundingCode", "Код источника финансирования", required=False),
    ImportColumn("isExistingAsset", "Ранее учтённое имущество", required=False),
    ImportColumn("accountingForm", "Форма учета", required=False),
    ImportColumn("notes", "Примечание", required=False),
)


@dataclass(frozen=True, slots=True)
class ParsedAssetImportRow:
    rowNumber: int
    values: dict[str, object]
