from decimal import Decimal

import pytest

from app.domain.procurement.rules import validate_budget, validate_delivery_quantities


def test_rejects_request_items_over_budget() -> None:
    with pytest.raises(ValueError, match="BUDGET_EXCEEDED"):
        validate_budget(
            Decimal("100"),
            ((Decimal("2"), Decimal("40")), (Decimal("1"), Decimal("30"))),
        )


def test_delivery_validation_adds_prior_partial_quantities() -> None:
    with pytest.raises(ValueError, match="DELIVERY_EXCEEDED"):
        validate_delivery_quantities(
            {"item-1": Decimal("5")},
            {"item-1": Decimal("4")},
            {"item-1": Decimal("2")},
        )
