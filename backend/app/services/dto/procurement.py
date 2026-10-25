"Команды рабочих процессов закупок, не зависящие от транспорта."

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class ProcurementItemCommand:
    name: str
    quantity: Decimal
    unit: str
    unitPrice: Decimal
    groupId: str | None = None


@dataclass(frozen=True, slots=True)
class ProcurementCommand:
    title: str
    budgetLimit: Decimal
    items: tuple[ProcurementItemCommand, ...]
    number: str | None = None
    description: str | None = None
    neededBy: date | None = None
    projectId: str | None = None
    documentId: str | None = None


@dataclass(frozen=True, slots=True)
class ProcurementQuery:
    page: int = 1
    pageSize: int = 25
    search: str | None = None
    status: str | None = None


@dataclass(frozen=True, slots=True)
class SupplierCommand:
    name: str
    taxId: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None


@dataclass(frozen=True, slots=True)
class ProcurementSubmitCommand:
    steps: tuple[tuple[str, str], ...]
    dueAt: datetime | None = None


@dataclass(frozen=True, slots=True)
class ProcurementContractCommand:
    supplierId: str
    number: str
    amount: Decimal
    signedAt: date
    deliveryDueAt: date
    documentId: str | None = None


@dataclass(frozen=True, slots=True)
class ProcurementDeliveryLineCommand:
    procurementItemId: str
    quantity: Decimal


@dataclass(frozen=True, slots=True)
class ProcurementDeliveryCommand:
    number: str
    receivedAt: date
    items: tuple[ProcurementDeliveryLineCommand, ...]
    note: str | None = None
    documentId: str | None = None


@dataclass(frozen=True, slots=True)
class ProcurementCapitalizeCommand:
    inventoryNumber: str
    molId: str
    groupId: str | None = None
    accountingForm: str = "145"
    notes: str | None = None
