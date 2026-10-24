from sqlalchemy import inspect

from app.models.procurement import (
    ProcurementDelivery,
    ProcurementDeliveryItem,
    ProcurementItem,
    ProcurementRequest,
)


def test_procurement_mappings_expose_workflow_collections() -> None:
    assert "items" in inspect(ProcurementRequest).relationships
    assert "deliveries" in inspect(ProcurementRequest).relationships
    assert "items" in inspect(ProcurementDelivery).relationships
    assert "deliveryItems" in inspect(ProcurementItem).relationships
    assert "procurementItem" in inspect(ProcurementDeliveryItem).relationships
