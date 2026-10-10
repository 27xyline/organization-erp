from datetime import datetime

import httpx
import pytest
from pydantic import SecretStr

from app.api.dependencies import (
    get_authenticated_context,
    get_catalog_service,
    get_department_service,
)
from app.core.config import Settings
from app.core.context import Actor, RequestContext
from app.domain.ports.departments import AssetGroupItem, DepartmentItem, MolItem
from app.main import create_app
from app.services.dto.catalogs import GroupCommand, MolCommand, MolReferences
from app.services.dto.departments import DepartmentReferences


class FakeDepartmentService:
    def __init__(self) -> None:
        self.last_query = None
        self.last_command = None
        self.last_update = None

    async def list(self, query, actor):
        self.last_query = query
        return [
            DepartmentItem(
                "dep-1",
                "HR",
                "HR",
                None,
                None,
                None,
                True,
                {"children": 0, "employees": 0, "staffPositions": 0, "mols": 0},
                datetime(2026, 1, 1),
                datetime(2026, 1, 1),
            )
        ]

    async def references(self, actor):
        return DepartmentReferences((), ())

    async def create(self, command, context):
        self.last_command = command
        return DepartmentItem(
            "dep-new",
            command.code,
            command.name,
            None,
            None,
            None,
            True,
            {},
            datetime.now(),
            datetime.now(),
        )

    async def update(self, department_id, command, context):
        self.last_update = (department_id, command)
        return DepartmentItem(
            department_id, "HR", "HR", None, None, None, True, {}, datetime.now(), datetime.now()
        )

    async def delete(self, department_id, context):
        return {"success": True}


class FakeCatalogService:
    async def list_groups(self, actor):
        return [AssetGroupItem("group-1", "Group", "G", None, datetime.now(), datetime.now())]

    async def create_group(self, command: GroupCommand, context):
        return AssetGroupItem(
            "group-new",
            command.name,
            command.code,
            command.description,
            datetime.now(),
            datetime.now(),
        )

    async def get_group(self, group_id, actor):
        return AssetGroupItem(group_id, "Group", "G", None, datetime.now(), datetime.now(), 0)

    async def update_group(self, group_id, command: GroupCommand, context):
        return AssetGroupItem(
            group_id,
            command.name,
            command.code,
            command.description,
            datetime.now(),
            datetime.now(),
        )

    async def delete_group(self, group_id, context):
        return {"success": True}

    async def list_mols(self, actor):
        return []

    async def mol_references(self, actor):
        from app.domain.ports.departments import DepartmentReference

        return MolReferences((DepartmentReference("dep-1", "HR", True, "HR"),))

    async def create_mol(self, command: MolCommand, context):
        return MolItem(
            "mol-new",
            command.code,
            command.department or "HR",
            "dep-1",
            command.full_name,
            command.storage_location,
            command.photo,
            None,
            datetime.now(),
            datetime.now(),
        )

    async def get_mol(self, mol_id, actor):
        return MolItem(
            mol_id,
            "M",
            "HR",
            "dep-1",
            "Person",
            "Room",
            None,
            None,
            datetime.now(),
            datetime.now(),
        )

    async def update_mol(self, mol_id, command: MolCommand, context):
        return MolItem(
            mol_id,
            command.code,
            command.department or "HR",
            "dep-1",
            command.full_name,
            command.storage_location,
            command.photo,
            None,
            datetime.now(),
            datetime.now(),
        )

    async def delete_mol(self, mol_id, context):
        return {"success": True}


@pytest.mark.anyio
async def test_department_catalog_http_envelopes_statuses_and_nullable_patch():
    department_service = FakeDepartmentService()
    catalog_service = FakeCatalogService()
    app = create_app(
        Settings(
            database_url="postgresql://localhost/unreachable",
            bridge_secret=SecretStr("bridge-test-secret-that-is-long-enough-1234"),
            internal_auth_secret=SecretStr("internal-test-secret-that-is-long-enough-1234"),
            otel_enabled=False,
        )
    )
    actor = Actor(actor_id="test", is_authenticated=True)

    async def context_override() -> RequestContext:
        return RequestContext("contract-request", actor=actor)

    app.dependency_overrides[get_authenticated_context] = context_override
    app.dependency_overrides[get_department_service] = lambda: department_service
    app.dependency_overrides[get_catalog_service] = lambda: catalog_service
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client,
    ):
        departments = await client.get("/api/departments?activeOnly=true")
        assert departments.status_code == 200
        assert departments.json()["data"][0]["headEmployeeId"] is None
        assert departments.json()["data"][0]["createdAt"].endswith("Z")
        assert department_service.last_query.active_only is True

        references = await client.get("/api/departments/references")
        assert references.json() == {"data": {"headCandidates": [], "parentCandidates": []}}

        invalid = await client.post("/api/departments", json={"code": "*", "name": "HR"})
        assert invalid.status_code == 422
        assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
        assert "fieldErrors" in invalid.json()["error"]

        created = await client.post("/api/departments", json={"code": "X", "name": "New"})
        assert created.status_code == 201
        created_data = created.json()["data"]
        assert {
            key: created_data[key]
            for key in (
                "id",
                "code",
                "name",
                "parentId",
                "headEmployeeId",
                "headEmployee",
                "isActive",
                "usage",
            )
        } == {
            "id": "dep-new",
            "code": "X",
            "name": "New",
            "parentId": None,
            "headEmployeeId": None,
            "headEmployee": None,
            "isActive": True,
            "usage": {},
        }

        patched = await client.patch(
            "/api/departments/dep-1", json={"parentId": None, "headEmployeeId": None}
        )
        assert patched.json()["data"]["parentId"] is None
        assert patched.json()["data"]["headEmployeeId"] is None
        identifier, command = department_service.last_update
        assert identifier == "dep-1"
        assert command.parent_id_set and command.head_employee_id_set
        assert command.parent_id is command.head_employee_id is None

        groups = await client.get("/api/groups")
        group_data = groups.json()["data"][0]
        assert {key: group_data[key] for key in ("id", "code", "name", "description")} == {
            "id": "group-1",
            "code": "G",
            "name": "Group",
            "description": None,
        }
        assert group_data["createdAt"].endswith("Z")
        mol_references = await client.get("/api/mols/references")
        assert mol_references.json()["data"]["departments"][0]["code"] == "HR"
