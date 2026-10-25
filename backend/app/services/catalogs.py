"Сценарии использования групп активов и материально ответственных лиц."

from typing import Any

from app.core.context import Actor, RequestContext
from app.domain.auth.rules import require_permission
from app.domain.catalogs.rules import normalize_department_reference
from app.domain.errors import DomainError, PersistenceConflict
from app.domain.ports.audit import AuditRecord
from app.domain.ports.departments import AssetGroupItem, DepartmentReference, MolItem
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.catalogs import GroupCommand, MolCommand, MolReferences

CATALOG_ERRORS = {
    "NOT_FOUND": ("Ресурс не найден", 404),
    "CODE_EXISTS": ("Код уже существует", 409),
    "IN_USE": ("Ресурс используется", 409),
    "DEPARTMENT_REQUIRED": ("Подразделение обязательно", 422),
    "DEPARTMENT_NOT_FOUND": ("Подразделение не найдено", 404),
    "INACTIVE_DEPARTMENT": ("Нельзя назначить неактивное подразделение", 409),
}


def _error(code: str, *, message: str | None = None) -> DomainError:
    fallback, status = CATALOG_ERRORS[code]
    return DomainError(code, message or fallback, status)


def _authorize(actor: Actor, permission: str, target: dict[str, Any] | None = None) -> None:
    if not actor.is_authenticated or actor.access is None:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    if actor.must_change_password:
        raise DomainError("PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403)
    require_permission(actor.access, permission, target)


async def _check_actor(uow: UnitOfWork, actor: Actor) -> None:
    current = await uow.users.get(actor.actor_id, for_update=True)
    if current is None or not current.is_active or current.session_version != actor.session_version:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)


def _raise_duplicate(
    error: PersistenceConflict, *, code_message: str, in_use_message: str = "Ресурс используется"
) -> None:
    if error.constraint in {
        "asset_groups_code_key",
        "asset_groups_name_key",
        "mols_code_key",
    }:
        raise _error("CODE_EXISTS", message=code_message) from error
    if error.constraint in {
        "assets_groupId_fkey",
        "assets_molId_fkey",
        "asset_holdings_molId_fkey",
        "asset_inventories_molId_fkey",
    }:
        raise _error("IN_USE", message=in_use_message) from error
    raise error


class CatalogService:
    def __init__(self, uow_factory: UnitOfWorkFactory[UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    async def list_groups(self, actor: Actor) -> list[AssetGroupItem]:
        _authorize(actor, "assetGroups.read")
        async with self._uow_factory() as uow:
            return await uow.groups.list()

    async def get_group(self, group_id: str, actor: Actor) -> AssetGroupItem | None:
        _authorize(actor, "assetGroups.read")
        async with self._uow_factory() as uow:
            return await uow.groups.get(group_id, include_usage=True)

    async def create_group(self, command: GroupCommand, context: RequestContext) -> AssetGroupItem:
        actor = context.actor
        assert actor is not None
        _authorize(actor, "assetGroups.create")
        async with self._uow_factory() as uow:
            await _check_actor(uow, actor)
            try:
                group = await uow.groups.create(command.to_values(create=True))
            except PersistenceConflict as error:
                _raise_duplicate(error, code_message="Группа с таким кодом уже существует")
            await uow.audit.append(
                AuditRecord(
                    "ASSET_GROUP_CREATE",
                    "AssetGroup",
                    group.id,
                    actor.actor_id,
                    {"after": {"id": group.id, "code": group.code, "name": group.name}},
                    context.request_id,
                )
            )
            await uow.commit()
            return group

    async def update_group(
        self, group_id: str, command: GroupCommand, context: RequestContext
    ) -> AssetGroupItem:
        actor = context.actor
        assert actor is not None
        _authorize(actor, "assetGroups.update")
        async with self._uow_factory() as uow:
            await _check_actor(uow, actor)
            current = await uow.groups.get(group_id)
            if current is None:
                raise _error("NOT_FOUND", message="Группа не найдена")
            try:
                group = await uow.groups.update(group_id, command.to_values())
            except PersistenceConflict as error:
                _raise_duplicate(error, code_message="Группа с таким кодом уже существует")
            if group is None:
                raise _error("NOT_FOUND", message="Группа не найдена")
            await uow.audit.append(
                AuditRecord(
                    "ASSET_GROUP_UPDATE",
                    "AssetGroup",
                    group_id,
                    actor.actor_id,
                    {
                        "before": {"code": current.code, "name": current.name},
                        "after": {"code": group.code, "name": group.name},
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return group

    async def delete_group(self, group_id: str, context: RequestContext) -> dict[str, bool]:
        actor = context.actor
        assert actor is not None
        _authorize(actor, "assetGroups.delete")
        async with self._uow_factory() as uow:
            await _check_actor(uow, actor)
            current = await uow.groups.get(group_id)
            if current is None:
                raise _error("NOT_FOUND", message="Группа не найдена")
            try:
                await uow.groups.delete(group_id)
            except PersistenceConflict as error:
                _raise_duplicate(
                    error,
                    code_message="Группа с таким кодом уже существует",
                    in_use_message="Группа используется объектами имущества",
                )
            await uow.audit.append(
                AuditRecord(
                    "ASSET_GROUP_DELETE",
                    "AssetGroup",
                    group_id,
                    actor.actor_id,
                    {"before": {"code": current.code, "name": current.name}},
                    context.request_id,
                )
            )
            await uow.commit()
            return {"success": True}

    async def list_mols(self, actor: Actor) -> list[MolItem]:
        _authorize(actor, "mols.read")
        assert actor.access is not None
        async with self._uow_factory() as uow:
            return await uow.mols.list_visible(actor.access.allowed_department_ids("mols.read"))

    async def get_mol(self, mol_id: str, actor: Actor) -> MolItem | None:
        _authorize(actor, "mols.read")
        assert actor.access is not None
        async with self._uow_factory() as uow:
            allowed = actor.access.allowed_department_ids("mols.read")
            target = await uow.mols.department_target(mol_id)
            if target is not None and not actor.access.allows(
                "mols.read", {"departmentId": target}
            ):
                raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
            return await uow.mols.get_visible(mol_id, allowed, include_usage=True)

    async def mol_references(self, actor: Actor) -> MolReferences:
        _authorize(actor, "mols.read")
        assert actor.access is not None
        async with self._uow_factory() as uow:
            department_read = actor.access.allowed_department_ids("departments.read")
            mol_read = actor.access.allowed_department_ids("mols.read")
            if department_read is None:
                visible_ids = mol_read
            elif mol_read is None:
                visible_ids = department_read
            else:
                visible_ids = tuple(sorted(set(department_read) & set(mol_read)))
            departments = await uow.departments.list_visible(
                active_only=True, allowed_ids=visible_ids
            )
            return MolReferences(
                tuple(
                    DepartmentReference(item.id, item.name, item.is_active, item.code)
                    for item in departments
                )
            )

    async def create_mol(self, command: MolCommand, context: RequestContext) -> MolItem:
        actor = context.actor
        assert actor is not None and actor.access is not None
        _authorize(actor, "mols.create")
        department_id, department_name = normalize_department_reference(
            command.department_id, command.department
        )
        async with self._uow_factory() as uow:
            await uow.departments.lock_organization_mutation()
            await _check_actor(uow, actor)
            department = await uow.mols.resolve_department(department_id, department_name)
            if department is None:
                raise _error("NOT_FOUND", message="Подразделение не найдено")
            if department_id and not actor.access.allows(
                "mols.create", {"departmentId": department_id}
            ):
                raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
            if not actor.access.allows("mols.create", {"departmentId": department.id}):
                raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
            department = self._validate_department(department)
            values = {
                "code": command.code,
                "fullName": command.full_name,
                "storageLocation": command.storage_location,
                "photo": command.photo,
                "department": department.name,
                "departmentId": department.id,
            }
            try:
                mol = await uow.mols.create(values)
            except PersistenceConflict as error:
                _raise_duplicate(error, code_message="МОЛ с таким кодом уже существует")
            await uow.audit.append(
                AuditRecord(
                    "MOL_CREATE",
                    "Mol",
                    mol.id,
                    actor.actor_id,
                    {
                        "after": {
                            key: mol.as_dict()[key]
                            for key in ("id", "code", "fullName", "departmentId", "department")
                        }
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return mol

    async def update_mol(
        self, mol_id: str, command: MolCommand, context: RequestContext
    ) -> MolItem:
        actor = context.actor
        assert actor is not None and actor.access is not None
        _authorize(actor, "mols.update")
        department_id, department_name = normalize_department_reference(
            command.department_id, command.department
        )
        async with self._uow_factory() as uow:
            await uow.departments.lock_organization_mutation()
            await _check_actor(uow, actor)
            current = await uow.mols.get_visible(mol_id, None)
            if current is None:
                raise _error("NOT_FOUND", message="МОЛ не найден")
            if not actor.access.allows("mols.update", {"departmentId": current.department_id}):
                raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
            destination = await uow.mols.resolve_department(department_id, department_name)
            if destination is None:
                raise _error("NOT_FOUND", message="Подразделение не найдено")
            targets = [current.department_id, destination.id]
            if not actor.access.allows("mols.update", {"departmentIds": targets}):
                raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
            destination = self._validate_department(
                destination,
                allow_inactive_id=current.department_id,
            )
            values = {
                "code": command.code,
                "fullName": command.full_name,
                "storageLocation": command.storage_location,
                "department": destination.name,
                "departmentId": destination.id,
            }
            if "photo" in command.present_fields:
                values["photo"] = command.photo
            try:
                mol = await uow.mols.update(mol_id, values)
            except PersistenceConflict as error:
                _raise_duplicate(error, code_message="МОЛ с таким кодом уже существует")
            if mol is None:
                raise _error("NOT_FOUND", message="МОЛ не найден")
            await uow.audit.append(
                AuditRecord(
                    "MOL_UPDATE",
                    "Mol",
                    mol_id,
                    actor.actor_id,
                    {
                        "before": {
                            key: current.as_dict()[key]
                            for key in ("code", "fullName", "departmentId", "department")
                        },
                        "after": {
                            key: mol.as_dict()[key]
                            for key in ("code", "fullName", "departmentId", "department")
                        },
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return mol

    async def delete_mol(self, mol_id: str, context: RequestContext) -> dict[str, bool]:
        actor = context.actor
        assert actor is not None and actor.access is not None
        _authorize(actor, "mols.delete")
        async with self._uow_factory() as uow:
            await uow.departments.lock_organization_mutation()
            await _check_actor(uow, actor)
            current = await uow.mols.get_visible(mol_id, None)
            if current is None:
                raise _error("NOT_FOUND", message="МОЛ не найден")
            if not actor.access.allows("mols.delete", {"departmentId": current.department_id}):
                raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
            try:
                await uow.mols.delete(mol_id)
            except PersistenceConflict as error:
                _raise_duplicate(
                    error,
                    code_message="МОЛ с таким кодом уже существует",
                    in_use_message="МОЛ используется в остатках или истории имущества",
                )
            await uow.audit.append(
                AuditRecord(
                    "MOL_DELETE",
                    "Mol",
                    mol_id,
                    actor.actor_id,
                    {
                        "before": {
                            key: current.as_dict()[key]
                            for key in ("code", "fullName", "departmentId", "department")
                        }
                    },
                    context.request_id,
                )
            )
            await uow.commit()
            return {"success": True}

    @staticmethod
    def _validate_department(
        department: DepartmentReference | None, *, allow_inactive_id: str | None = None
    ) -> DepartmentReference:
        if department is None:
            raise _error("NOT_FOUND", message="Подразделение не найдено")
        if not department.is_active and department.id != allow_inactive_id:
            raise _error("INACTIVE_DEPARTMENT", message="Нельзя назначить неактивное подразделение")
        return department
