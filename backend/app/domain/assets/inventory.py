from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class InventoryQuantity:
    expected: Decimal
    found: Decimal | None


def summarize_inventory(entries: Sequence[InventoryQuantity]) -> dict[str, int | str]:
    checked = sum(entry.found is not None for entry in entries)
    discrepancies = sum(
        entry.found is not None and entry.found != entry.expected for entry in entries
    )
    missing = len(entries) - checked
    found_total = sum((entry.found or Decimal(0) for entry in entries), Decimal(0))
    return {
        "totalAssets": len(entries),
        "checkedAssets": checked,
        "missingAssets": missing,
        "quantityDiscrepancies": discrepancies,
        "totalDiscrepancies": missing + discrepancies,
        "expectedQuantityTotal": f"{sum((entry.expected for entry in entries), Decimal(0)):.2f}",
        "foundQuantityTotal": f"{found_total:.2f}",
    }
