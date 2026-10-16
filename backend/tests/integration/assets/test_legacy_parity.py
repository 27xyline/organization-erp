"""Replay live 6a7b63a contracts, exact recursive DTO shapes, state and every audit payload."""

import json
from dataclasses import replace
from datetime import date
from io import BytesIO
from pathlib import Path

import httpx
import pytest
from openpyxl import Workbook
from opentelemetry import trace
from sqlalchemy import select

from app.api.dependencies import get_authenticated_context
from app.domain.auth.rules import AccessContext, ScopeGrant
from app.main import create_app
from app.models.assets import AssetInventoryEntry
from app.models.notifications import NotificationOutbox
from app.models.users import AuditLog
from app.services.assets import asset_json

FIXTURE = Path(__file__).parents[2] / "contracts/fixtures/assets/stage07-live-legacy.json"


def shape(value):
    if value is None:
        return "null"
    if isinstance(value, dict):
        return {key: shape(item) for key, item in value.items()}
    if isinstance(value, list):
        unique = {json.dumps(shape(item), sort_keys=True): shape(item) for item in value}
        return {"array": [unique[key] for key in sorted(unique)], "length": len(value)}
    return (
        "boolean"
        if isinstance(value, bool)
        else "number"
        if isinstance(value, (int, float))
        else "string"
    )


def expanded(value, definitions):
    if isinstance(value, dict):
        if set(value) == {"$ref"}:
            return expanded(definitions[value["$ref"]], definitions)
        return {key: expanded(item, definitions) for key, item in value.items()}
    if isinstance(value, list):
        return [expanded(item, definitions) for item in value]
    return value


@pytest.mark.anyio
async def test_live_legacy_dtos_state_all_fourteen_audits_and_zero_outbox(asset_env):
    from sqlalchemy import func

    prefix, context, factory, service, command, sessions = asset_env
    golden = json.loads(FIXTURE.read_text())
    app = create_app()
    app.state.tracer = trace.get_tracer(__name__)
    app.state.unit_of_work_factory = factory
    current_context = context

    async def auth():
        return current_context

    app.dependency_overrides[get_authenticated_context] = auth
    calls = {}
    aliases = {prefix: "MOL_FROM", prefix + "-to": "MOL_TO"}
    async with sessions() as session:
        initial_outbox = await session.scalar(select(func.count()).select_from(NotificationOutbox))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:

        async def call(name, method, path, body=None):
            response = (
                await client.request(method, path, json=body)
                if body is not None
                else await client.request(method, path)
            )
            calls[name] = response
            return (
                response.json()
                if response.headers.get("content-type", "").startswith("application/json")
                else response.content
            )

        await call("mols", "GET", "/api/mols")
        await call("groups", "GET", "/api/groups")
        await call("assets-list", "GET", "/api/assets?archived=false")
        await call(
            "asset-create-invalid", "POST", "/api/assets", {"inventoryNumber": prefix + "-BAD"}
        )
        body = {
            "name": "Stage07 legacy " + prefix,
            "inventoryNumber": prefix + "-001",
            "unitPrice": "5.25",
            "unitOfMeasure": "шт",
            "quantity": "10",
            "molId": prefix,
            "groupId": prefix,
            "recordingDate": "2026-07-16",
            "documentType": "Накладная",
            "documentDetails": prefix,
            "documentFiles": [],
            "photos": [],
            "isExistingAsset": False,
            "status": "IN_STOCK",
            "accountingForm": "145",
        }
        await call(
            "asset-create-invalid-date",
            "POST",
            "/api/assets",
            {**body, "recordingDate": "not-a-date"},
        )
        await call(
            "asset-create-invalid-planned-disposal-date",
            "POST",
            "/api/assets",
            {**body, "plannedDisposalDate": "not-a-date"},
        )
        created = await call("asset-create", "POST", "/api/assets", body)
        asset_id = created["data"]["id"]
        aliases[asset_id] = "ASSET"
        await call("asset-detail", "GET", "/api/assets/" + asset_id)
        move = {
            "fromMolId": prefix,
            "toMolId": prefix + "-to",
            "quantity": "4",
            "date": "2026-07-16",
            "documentType": "Накладная",
            "documentDetails": prefix + "-transfer",
            "documentFiles": [],
        }
        await call(
            "transfer-invalid-quantity",
            "POST",
            f"/api/assets/{asset_id}/transfers",
            {**move, "quantity": "99"},
        )
        await call("asset-transfer", "POST", f"/api/assets/{asset_id}/transfers", move)
        await call(
            "asset-disposal",
            "POST",
            f"/api/assets/{asset_id}/disposals",
            {
                "fromMolId": prefix + "-to",
                "quantity": "1",
                "date": "2026-07-16",
                "reason": "Проверка износа",
                "documentType": "Акт списания",
                "documentDetails": prefix + "-disposal",
                "documentFiles": [],
            },
        )
        await call("maintenance-list-before", "GET", f"/api/assets/{asset_id}/maintenance")
        maintenance = await call(
            "maintenance-create",
            "POST",
            f"/api/assets/{asset_id}/maintenance",
            {
                "type": "REPAIR",
                "title": "Плановый осмотр " + prefix,
                "scheduledDate": "2026-07-17",
                "nextDueDate": "2027-07-17",
                "provider": "E2E service",
                "cost": "12.50",
            },
        )
        maintenance_id = maintenance["data"]["id"]
        aliases[maintenance_id] = "MAINTENANCE"
        await call(
            "maintenance-start",
            "PUT",
            f"/api/assets/{asset_id}/maintenance/{maintenance_id}",
            {"status": "IN_PROGRESS"},
        )
        await call(
            "maintenance-update",
            "PUT",
            f"/api/assets/{asset_id}/maintenance/{maintenance_id}",
            {
                "status": "COMPLETED",
                "startedAt": "2026-07-17T09:00:00.000Z",
                "completedAt": "2026-07-17T10:00:00.000Z",
                "result": "Проверено",
                "cost": "12.50",
            },
        )
        await call("maintenance-list-after", "GET", f"/api/assets/{asset_id}/maintenance")
        await call(
            "operations-for-asset", "GET", f"/api/operations?assetId={asset_id}&pageSize=100"
        )
        await call("qr", "GET", f"/api/assets/{asset_id}/qr")
        view = await call(
            "saved-view-create",
            "POST",
            "/api/assets/saved-views",
            {"name": "Stage07 " + prefix, "filters": {"search": prefix + "-001"}},
        )
        await call("saved-view-list", "GET", "/api/assets/saved-views")
        await call("saved-view-delete", "DELETE", "/api/assets/saved-views/" + view["data"]["id"])
        sheet = await call(
            "inventory-create",
            "POST",
            "/api/assets/inventories",
            {"name": "Stage07 inventory " + prefix, "molId": prefix + "-to"},
        )
        inventory_id = sheet["data"]["id"]
        aliases[inventory_id] = "INVENTORY"
        await call("inventory-list", "GET", "/api/assets/inventories")
        await call("inventory-options", "GET", "/api/assets/inventories/options")
        await call(
            "inventory-resolve", "GET", "/api/assets/inventories/resolve?number=" + prefix + "-001"
        )
        await call("inventory-detail", "GET", "/api/assets/inventories/" + inventory_id)
        scan = await call(
            "inventory-scan",
            "POST",
            f"/api/assets/inventories/{inventory_id}/scan",
            {"inventoryNumber": prefix + "-001", "foundQuantity": 3, "note": "Legacy capture"},
        )
        aliases[scan["data"]["id"]] = "ENTRY"
        await call(
            "inventory-scan-repeat",
            "POST",
            f"/api/assets/inventories/{inventory_id}/scan",
            {
                "inventoryNumber": prefix + "-001",
                "foundQuantity": 4,
                "note": "Repeat legacy capture",
            },
        )
        await call(
            "inventory-complete", "POST", f"/api/assets/inventories/{inventory_id}/complete", {}
        )
        await call(
            "inventory-complete-repeat",
            "POST",
            f"/api/assets/inventories/{inventory_id}/complete",
            {},
        )
        await call("import-template", "GET", "/api/assets/import/template")
        from app.domain.assets.importing import ASSET_IMPORT_COLUMNS

        book = Workbook()
        worksheet = book.active
        worksheet.title = "Имущество"
        worksheet.append([column.label for column in ASSET_IMPORT_COLUMNS])
        worksheet.append(
            [
                prefix + "-IMP",
                "Stage07 import " + prefix,
                3.75,
                "шт",
                2,
                prefix,
                prefix,
                date(2026, 7, 18),
                "Накладная",
                prefix + "-import",
                "",
                "",
                "Нет",
                "145",
                "import fixture",
            ]
        )
        output = BytesIO()
        book.save(output)
        preview = await client.post(
            "/api/assets/import/preview", files={"file": ("stage07.xlsx", output.getvalue())}
        )
        calls["import-preview"] = preview
        await call(
            "import-commit",
            "POST",
            "/api/assets/import/commit",
            {"assets": [preview.json()["data"]["rows"][0]["input"]]},
        )
        bad = await client.post(
            "/api/assets/import/preview", files={"file": ("bad.xlsx", b"not-xlsx")}
        )
        calls["import-invalid-workbook"] = bad
        await call("operations-list", "GET", "/api/operations")
        await call("inventory-export-unsupported", "GET", "/api/export?type=documents")
        outside = await call(
            "asset-create-outside",
            "POST",
            "/api/assets",
            {
                **body,
                "name": "Stage07 outside " + prefix,
                "inventoryNumber": prefix + "-OUT",
                "unitPrice": "1",
                "quantity": "1",
                "molId": prefix + "-other",
                "documentType": "Акт",
                "documentDetails": prefix + "-outside",
            },
        )
        aliases[outside["data"]["id"]] = "OUTSIDE_ASSET"
        current_context = replace(
            context,
            actor=replace(
                context.actor,
                access=AccessContext(
                    prefix,
                    None,
                    None,
                    (),
                    (ScopeGrant("scope", "ASSET_CUSTODIAN", "ASSIGNED", "NONE", (prefix,)),),
                ),
            ),
        )
        await call("asset-scope-denial", "GET", "/api/assets/" + outside["data"]["id"])
        current_context = context
        await call(
            "asset-archive",
            "POST",
            f"/api/assets/{asset_id}/archive",
            {"reason": "Stage07 legacy capture archive"},
        )
        await call(
            "assets-archived-list", "GET", "/api/assets?archived=true&search=" + prefix + "-001"
        )
        await call("asset-restore", "POST", f"/api/assets/{asset_id}/restore", {})
        await call("asset-final-detail", "GET", "/api/assets/" + asset_id)
        inventory_summary = calls["inventory-detail"].json()["data"]["summary"]
        assert shape(inventory_summary) == shape(golden["inventorySummary"])
        assert inventory_summary == golden["inventorySummary"]
        # Live baseline completion returns COMPLETED with a nonempty completedAt string.
        completed_inventory = calls["inventory-complete"].json()["data"]
        assert completed_inventory["status"] == "COMPLETED"
        assert isinstance(completed_inventory["completedAt"], str)
        assert completed_inventory["completedAt"].strip()
        for name, expected_shape in golden["successShapes"].items():
            assert shape(calls[name].json()) == expanded(
                expected_shape, golden["shapeDefinitions"]
            ), name
        for name, response in calls.items():
            if name in golden["statuses"]:
                assert response.status_code == golden["statuses"][name], name
        for name, headers in golden["binaryHeaders"].items():
            assert {key: calls[name].headers[key] for key in headers} == headers, name
    async with sessions() as session:
        audits = (
            await session.scalars(
                select(AuditLog)
                .where(AuditLog.userId == prefix)
                .order_by(AuditLog.createdAt, AuditLog.id)
            )
        ).all()
        audit_values = [
            {
                "action": row.action,
                "entityType": row.entityType,
                "entityId": row.entityId,
                "details": row.details,
            }
            for row in audits
        ]
        for row in audit_values:
            if row["action"] == "ASSET_CREATE" and row["details"]["after"][
                "inventoryNumber"
            ].endswith("-IMP"):
                aliases[row["entityId"]] = "IMPORTED_ASSET"
            if "operationId" in row["details"]:
                aliases[row["details"]["operationId"]] = (
                    "TRANSFER_OPERATION"
                    if row["action"] == "ASSET_TRANSFER"
                    else "DISPOSAL_OPERATION"
                )
        final = await service.get(asset_id, context.actor)
        entries = (
            await session.scalars(
                select(AssetInventoryEntry).where(AssetInventoryEntry.inventoryId == inventory_id)
            )
        ).all()
        maintenance_records = await factory_maintenance(factory, asset_id)
        state = {
            "id": final.id,
            "inventoryNumber": final.inventoryNumber,
            "quantity": asset_json(final.quantity),
            "totalCost": asset_json(final.totalCost),
            "status": final.status,
            "isArchived": final.isArchived,
            "holdings": [
                {"molId": h.molId, "quantity": asset_json(h.quantity)} for h in final.holdings
            ],
            "operations": [
                {
                    "type": op["type"],
                    "quantity": asset_json(op["quantity"]),
                    "documentType": op["documentType"],
                }
                for op in reversed(final.operations)
            ],
            "maintenance": [
                {"type": m.type, "status": m.status, "cost": asset_json(m.cost)}
                for m in maintenance_records
            ],
            "inventoryEntries": [
                {
                    "inventoryNumber": e.inventoryNumber,
                    "expectedQuantity": asset_json(e.expectedQuantity),
                    "foundQuantity": asset_json(e.foundQuantity),
                }
                for e in entries
            ],
        }
        outbox = await session.scalar(select(func.count()).select_from(NotificationOutbox))

    def normalize(value, key=""):
        if isinstance(value, dict):
            return {name: normalize(item, name) for name, item in value.items()}
        if isinstance(value, list):
            return [normalize(item) for item in value]
        if isinstance(value, str):
            if value in aliases:
                return aliases[value]
            if key == "completedAt":
                return "NOW"
            return value.replace(prefix, "CASE")
        return value

    # Source capture is createdAt-ordered; API detail is date-desc. Compare history multisets.
    expected_state = golden["state"]
    actual_state = normalize(state)
    expected_state["operations"] = sorted(
        expected_state["operations"], key=lambda row: json.dumps(row, sort_keys=True)
    )
    actual_state["operations"] = sorted(
        actual_state["operations"], key=lambda row: json.dumps(row, sort_keys=True)
    )
    assert shape(actual_state) == shape(expected_state)
    assert actual_state == expected_state
    actual_audits = normalize(audit_values)
    assert shape(actual_audits) == shape(golden["auditPayloads"])
    assert actual_audits == golden["auditPayloads"]
    assert {"initial": initial_outbox, "final": outbox, "delta": outbox - initial_outbox} == golden[
        "outbox"
    ]


async def factory_maintenance(factory, asset_id):
    async with factory() as uow:
        return await uow.assets.maintenance(asset_id)
