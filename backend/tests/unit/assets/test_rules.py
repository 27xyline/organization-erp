from decimal import Decimal

import pytest

from app.domain.assets.inventory import InventoryQuantity, summarize_inventory
from app.domain.assets.lifecycle import remaining_quantity
from app.domain.assets.maintenance import ensure_transition
from app.domain.errors import DomainError


def test_quantity_math_is_decimal_and_rejects_double_writeoff() -> None:
    assert remaining_quantity(Decimal("0.30"), Decimal("0.10")) == Decimal("0.20")
    with pytest.raises(DomainError) as error:
        remaining_quantity(Decimal("0.10"), Decimal("0.20"))
    assert error.value.code == "INSUFFICIENT_QUANTITY"


def test_inventory_missing_is_not_counted_as_scanned_zero() -> None:
    result = summarize_inventory(
        (InventoryQuantity(Decimal("1.20"), None), InventoryQuantity(Decimal("2.30"), Decimal("0")))
    )
    assert result == {
        "totalAssets": 2,
        "checkedAssets": 1,
        "missingAssets": 1,
        "quantityDiscrepancies": 1,
        "totalDiscrepancies": 2,
        "expectedQuantityTotal": "3.50",
        "foundQuantityTotal": "0.00",
    }


def test_maintenance_terminal_state_cannot_reopen_but_self_transition_is_allowed() -> None:
    ensure_transition("COMPLETED", "COMPLETED")
    with pytest.raises(DomainError):
        ensure_transition("COMPLETED", "IN_PROGRESS")
