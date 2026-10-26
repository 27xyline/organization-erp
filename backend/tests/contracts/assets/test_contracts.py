"""Транспортные контракты, не требующие подключения к базе данных."""

import httpx
import pytest
from opentelemetry import trace
from pydantic import ValidationError

from app.api.dependencies import get_authenticated_context
from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.main import create_app
from app.schemas.assets import CountInput, SavedFilters, TransferInput


def actor(role="ADMIN"):
    return Actor(
        "actor",
        is_authenticated=True,
        access=AccessContext("actor", None, None, (), (ScopeGrant("grant", role, "ALL", "ALL"),)),
    )


def app_for_actor(user):
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)

    async def auth():
        return RequestContext("request", actor=user)

    app.dependency_overrides[get_authenticated_context] = auth
    return app


@pytest.mark.anyio
async def test_malformed_json_matches_legacy_500_but_safe_parse_routes_422():
    app = app_for_actor(actor())
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for path in [
            "/api/assets",
            "/api/assets/id/archive",
            "/api/assets/id/transfers",
            "/api/assets/id/disposals",
        ]:
            response = await client.post(
                path, content=b"{", headers={"content-type": "application/json"}
            )
            assert response.status_code == 500, (path, response.text)
        for path in [
            "/api/assets/saved-views",
            "/api/assets/inventories",
            "/api/assets/id/maintenance",
        ]:
            response = await client.post(
                path, content=b"{", headers={"content-type": "application/json"}
            )
            assert response.status_code == 422, (path, response.text)
            assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.anyio
async def test_permission_is_checked_before_invalid_body():
    app = app_for_actor(actor("EMPLOYEE"))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        for path in [
            "/api/assets",
            "/api/assets/id/transfers",
            "/api/assets/id/disposals",
            "/api/assets/inventories",
        ]:
            response = await client.post(path, json={})
            assert response.status_code == 403, (path, response.text)
            assert response.json()["error"]["code"] == "FORBIDDEN"


def test_inventory_counts_are_finite_nonnegative_two_decimal_places():
    for quantity in ["-1", "NaN", "Infinity", "0.001", "100000000"]:
        with pytest.raises(ValidationError):
            CountInput(inventoryNumber="inv", foundQuantity=quantity)
    assert CountInput(inventoryNumber=" inv ", foundQuantity="0.20").inventoryNumber == "inv"


def test_transfer_same_mol_is_rejected_and_datetime_normalized():
    with pytest.raises(ValidationError):
        TransferInput(
            fromMolId="same",
            toMolId="same",
            quantity=1,
            date="2026-10-01",
            documentType="Act",
            documentDetails="Act",
        )
    valid = TransferInput(
        fromMolId="first",
        toMolId="second",
        quantity="0.20",
        date="2026-10-01T03:00:00+03:00",
        documentType="Act",
        documentDetails="Act",
    )
    assert valid.date.isoformat() == "2026-10-01T00:00:00"


def test_saved_filters_reject_unknown_fields_and_reversed_dates():
    with pytest.raises(ValidationError):
        SavedFilters(archived=True)
    with pytest.raises(ValidationError):
        SavedFilters(dateFrom="2026-10-02", dateTo="2026-10-01")


@pytest.mark.anyio
async def test_nonempty_malformed_asset_dates_preserve_live_legacy_500():
    app = app_for_actor(actor())
    app.state.unit_of_work_factory = lambda: None
    body = {
        "name": "Asset",
        "inventoryNumber": "date-contract",
        "unitPrice": "1",
        "unitOfMeasure": "шт",
        "quantity": "1",
        "molId": "mol",
        "groupId": "group",
        "recordingDate": "not-a-date",
        "documentType": "Act",
        "documentDetails": "Act",
    }
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        assert (await client.post("/api/assets", json=body)).status_code == 500
        assert (
            await client.post(
                "/api/assets",
                json={**body, "recordingDate": "2026-10-01", "plannedDisposalDate": "not-a-date"},
            )
        ).status_code == 500
        assert (
            await client.put("/api/assets/id", json={**body, "editReason": "Correction"})
        ).status_code == 500
