import pytest

from app.schemas.procurement import ProcurementCreateInput, SupplierCreateInput


def test_procurement_input_rejects_items_over_budget() -> None:
    with pytest.raises(ValueError, match="Стоимость позиций превышает бюджетный лимит"):
        ProcurementCreateInput.model_validate(
            {
                "number": "PR-1",
                "title": "Новый сервер",
                "budgetLimit": "100",
                "items": [{"name": "Сервер", "quantity": "2", "unit": "шт", "unitPrice": "60"}],
            }
        )


def test_supplier_input_checks_inn_checksum() -> None:
    assert SupplierCreateInput(name="Поставщик", taxId="7707083893").taxId == "7707083893"
    with pytest.raises(ValueError, match="Некорректная контрольная сумма ИНН"):
        SupplierCreateInput(name="Поставщик", taxId="7701234567")
