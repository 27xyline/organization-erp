"""Full public core route/method matrix against PostgreSQL state."""

import httpx
import pytest
from opentelemetry import trace
from sqlalchemy import event

from app.api.dependencies import get_authenticated_context
from app.main import create_app


@pytest.mark.anyio
async def test_assets_inventory_maintenance_saved_views_operations_http_matrix(asset_env):
    prefix, context, factory, service, command, sessions = asset_env
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = factory

    async def auth():
        return context

    app.dependency_overrides[get_authenticated_context] = auth
    body = {
        "name": "HTTP asset",
        "inventoryNumber": prefix,
        "unitPrice": "12.34",
        "unitOfMeasure": "шт",
        "quantity": "0.30",
        "molId": prefix,
        "groupId": prefix,
        "recordingDate": "2026-10-01",
        "documentType": "Акт",
        "documentDetails": "Initial",
    }
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/api/assets", json=body)
        assert response.status_code == 201, response.text
        asset = response.json()["data"]
        asset_id = asset["id"]
        assert asset["unitPrice"] == "12.34"
        assert asset["quantity"] == "0.3"
        assert asset["holdings"][0]["mol"]["id"] == prefix
        assert (await client.post("/api/assets", json=body)).status_code == 409
        listing = await client.get("/api/assets?limit=1&search=" + prefix)
        assert listing.status_code == 200
        assert listing.json()["pagination"]["total"] == 1
        assert listing.json()["data"][0]["_count"]["operations"] == 1
        assert (await client.get("/api/assets/catalogs")).json()["data"]["groups"]
        assert (await client.get("/api/assets/" + asset_id)).json()["data"]["operations"][0][
            "type"
        ] == "RECEIPT"
        updated = await client.put(
            "/api/assets/" + asset_id, json={**body, "name": "Changed", "editReason": "Уточнение"}
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["data"]["name"] == "Changed"
        forbidden_quantity = await client.put(
            "/api/assets/" + asset_id, json={**body, "quantity": "0.40", "editReason": "Bad"}
        )
        assert forbidden_quantity.status_code == 409
        assert forbidden_quantity.json()["error"]["code"] == "QUANTITY_OPERATION_REQUIRED"
        view = await client.post(
            "/api/assets/saved-views", json={"name": prefix, "filters": {"search": "Changed"}}
        )
        assert view.status_code == 201, view.text
        view_id = view.json()["data"]["id"]
        assert (
            await client.post("/api/assets/saved-views", json={"name": prefix, "filters": {}})
        ).json()["error"]["code"] == "SAVED_VIEW_EXISTS"
        assert len((await client.get("/api/assets/saved-views")).json()["data"]) == 1
        assert (await client.delete("/api/assets/saved-views/" + view_id)).status_code == 204
        assert (await client.delete("/api/assets/saved-views/" + view_id)).status_code == 404
        maintenance = await client.post(
            f"/api/assets/{asset_id}/maintenance",
            json={"type": "REPAIR", "title": "Ремонт", "scheduledDate": "2026-10-03"},
        )
        assert maintenance.status_code == 201, maintenance.text
        maintenance_id = maintenance.json()["data"]["id"]
        assert (await client.get(f"/api/assets/{asset_id}/maintenance")).status_code == 200
        assert (
            await client.put(
                f"/api/assets/{asset_id}/maintenance/{maintenance_id}",
                json={"status": "IN_PROGRESS"},
            )
        ).status_code == 200
        assert (
            await client.put(
                f"/api/assets/{asset_id}/maintenance/{maintenance_id}", json={"status": "COMPLETED"}
            )
        ).status_code == 200
        qr = await client.get(f"/api/assets/{asset_id}/qr?origin=http%3A%2F%2Fbrowser.example")
        assert qr.status_code == 200, qr.text
        assert qr.headers["content-type"] == "image/svg+xml; charset=utf-8"
        assert qr.headers["cache-control"] == "private, no-store"
        assert qr.headers["x-content-type-options"] == "nosniff"
        assert b"<svg" in qr.content
        assert (await client.get("/api/assets/inventories/options")).json()["data"]
        sheet = await client.post(
            "/api/assets/inventories", json={"name": "Ведомость HTTP", "molId": prefix}
        )
        assert sheet.status_code == 201, sheet.text
        inventory_id = sheet.json()["data"]["id"]
        assert any(
            row["id"] == inventory_id
            for row in (await client.get("/api/assets/inventories?pageSize=100")).json()["data"]
        )
        assert (
            len(
                (await client.get("/api/assets/inventories/resolve?number=" + prefix)).json()[
                    "data"
                ]
            )
            == 1
        )
        scan = await client.post(
            f"/api/assets/inventories/{inventory_id}/scan",
            json={"inventoryNumber": prefix, "foundQuantity": "0.20"},
        )
        assert scan.status_code == 200
        assert "scannedBy" not in scan.json()["data"]
        detail = await client.get("/api/assets/inventories/" + inventory_id)
        assert detail.json()["data"]["summary"]["totalDiscrepancies"] == 1
        act = await client.get(f"/api/assets/inventories/{inventory_id}/act")
        assert act.json()["data"]["entries"][0]["differenceQuantity"] == "-0.10"
        assert (
            await client.post(f"/api/assets/inventories/{inventory_id}/complete")
        ).status_code == 200
        assert (
            await client.post(f"/api/assets/inventories/{inventory_id}/complete")
        ).status_code == 409
        movement = {
            "fromMolId": prefix,
            "toMolId": prefix + "-to",
            "quantity": "0.10",
            "date": "2026-10-04",
            "documentType": "Акт",
            "documentDetails": "Перемещение",
        }
        transfer = await client.post(f"/api/assets/{asset_id}/transfers", json=movement)
        assert transfer.status_code == 201, transfer.text
        assert len(transfer.json()["data"]["holdings"]) == 2
        disposal = await client.post(
            f"/api/assets/{asset_id}/disposals", json={**movement, "quantity": "0.10"}
        )
        assert disposal.status_code == 201, disposal.text
        assert disposal.json()["data"]["quantity"] == "0.2"
        assert all("mol" not in holding for holding in disposal.json()["data"]["holdings"])
        assert (await client.get("/api/operations?assetId=" + asset_id)).json()["pagination"][
            "total"
        ] == 6
        assert (
            await client.post(f"/api/assets/{asset_id}/archive", json={"reason": "На хранение"})
        ).json()["data"]["isArchived"]
        assert (await client.get("/api/assets?archived=true&search=" + prefix)).json()[
            "pagination"
        ]["total"] == 1
        assert not (await client.post(f"/api/assets/{asset_id}/restore")).json()["data"][
            "isArchived"
        ]


@pytest.mark.anyio
async def test_asset_list_is_bounded_without_per_asset_n_plus_one(asset_env):
    from dataclasses import replace

    prefix, context, factory, service, command, sessions = asset_env
    for index in range(6):
        await service.create(replace(command, inventoryNumber=f"{prefix}-{index}"), context)
    engine = sessions.kw["bind"].sync_engine
    statements = []

    def count_sql(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", count_sql)
    try:
        from app.services.dto.assets import AssetQuery

        page = await service.list(AssetQuery(search=prefix), context.actor)
        assert len(page.assets) == 6
        assert len(statements) <= 8, len(statements)
    finally:
        event.remove(engine, "before_cursor_execute", count_sql)
