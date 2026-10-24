"""Pure procurement invariants shared by application use cases."""

from collections.abc import Mapping, Sequence
from decimal import Decimal


def validate_budget(
    budget_limit: Decimal, items: Sequence[tuple[Decimal, Decimal]]
) -> Decimal:
    total = sum((quantity * price for quantity, price in items), Decimal(0))
    if total > budget_limit:
        raise ValueError("BUDGET_EXCEEDED")
    return total


def validate_delivery_quantities(
    ordered: Mapping[str, Decimal],
    already_delivered: Mapping[str, Decimal],
    incoming: Mapping[str, Decimal],
) -> bool:
    """Validate cumulative receipt and return whether every line is complete."""
    for item_id, quantity in incoming.items():
        if item_id not in ordered:
            raise ValueError("REFERENCE_NOT_FOUND")
        if already_delivered.get(item_id, Decimal(0)) + quantity > ordered[item_id]:
            raise ValueError("DELIVERY_EXCEEDED")
    return all(
        already_delivered.get(item_id, Decimal(0)) + incoming.get(item_id, Decimal(0))
        == quantity
        for item_id, quantity in ordered.items()
    )
