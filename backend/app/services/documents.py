"""Document use cases: one DB commit, private storage leases, explicit reconciliation."""

import re
import unicodedata
from collections.abc import AsyncIterator
from dataclasses import replace
from datetime import UTC, datetime
from typing import cast

from app.core.context import Actor, RequestContext
from app.domain.auth.rules import AccessContext, expand_descendants
from app.domain.documents.access import access_for
from app.domain.documents.file_policy import FileMetadata, validate_file
from app.domain.documents.records import DocumentChanges, DocumentOptions, NewDocument, NewVersion
from app.domain.documents.versioning import can_transition
from app.domain.errors import DomainError
from app.domain.ports.audit import AuditRecord, JsonValue
from app.domain.ports.documents import RenderingPort, StoragePort
from app.domain.ports.uow import UnitOfWork, UnitOfWorkFactory
from app.services.dto.documents import (
    DocumentCommand,
    DocumentPage,
    DocumentQuery,
    DocumentView,
    Download,
    GenerateCommand,
    StagedObject,
    Upload,
    VersionCommand,
)


def error(code: str) -> DomainError:
    message, status = {
        "NOT_FOUND": ("Документ или версия не найдены", 404),
        "INVALID_STATE": ("Операция недоступна в текущем статусе документа", 409),
        "OPTIMISTIC_LOCK_CONFLICT": (
            "Документ уже изменён другим пользователем. Обновите страницу",
            409,
        ),
    }[code]
    return DomainError(code, message, status)


async def current_access(uow: UnitOfWork, actor: Actor, permission: str) -> AccessContext:
    user = await uow.users.get(actor.actor_id, for_update=True)
    if user is None or not user.is_active or user.session_version != actor.session_version:
        raise DomainError("UNAUTHENTICATED", "Требуется вход в систему", 401)
    if user.must_change_password:
        raise DomainError("PASSWORD_CHANGE_REQUIRED", "Необходимо изменить временный пароль", 403)
    departments = (
        await uow.users.departments()
        if any(g.department_scope_mode == "ASSIGNED" for g in user.grants)
        else ()
    )
    grants = tuple(
        replace(g, department_ids=expand_descendants(g.department_ids, departments))
        if g.department_scope_mode == "ASSIGNED"
        else g
        for g in user.grants
    )
    access = AccessContext(
        user.id, user.employee_id, user.employee_department_id, user.member_project_ids, grants
    )
    if not access.has(permission):
        raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
    return access


class DocumentService:
    def __init__(
        self,
        uow_factory: UnitOfWorkFactory[UnitOfWork],
        storage: StoragePort,
        rendering: RenderingPort,
        maximum: int = 25 * 1024 * 1024,
    ) -> None:
        self._uow_factory = uow_factory
        self.storage = storage
        self.rendering = rendering
        self.maximum = maximum

    async def list(self, query: DocumentQuery, actor: Actor) -> DocumentPage:
        access = access_for(actor, "documents.read")
        async with self._uow_factory() as uow:
            return await uow.documents.list(query, access)

    async def get(self, document_id: str, actor: Actor) -> DocumentView:
        access = access_for(actor, "documents.read")
        async with self._uow_factory() as uow:
            document = await uow.documents.get(document_id, access, "documents.read")
            if document is None:
                raise error("NOT_FOUND")
            return document

    async def options(self, actor: Actor) -> DocumentOptions:
        access = access_for(actor, "documents.create")
        async with self._uow_factory() as uow:
            return await uow.documents.options(access)

    async def _audit(
        self,
        uow: UnitOfWork,
        context: RequestContext,
        action: str,
        identifier: str,
        details: dict[str, object],
    ) -> None:
        assert context.actor is not None
        await uow.audit.append(
            AuditRecord(
                action,
                "Document",
                identifier,
                context.actor.actor_id,
                cast(dict[str, JsonValue], details),
                context.request_id,
            )
        )

    async def _preflight_create(self, command: DocumentCommand, actor: Actor) -> None:
        access = access_for(actor, "documents.create")
        async with self._uow_factory() as uow:
            target = await uow.documents.links(
                command.projectId, command.employeeId, command.assetId
            )
            if not access.allows("documents.create", target.permission_target()):
                raise DomainError("FORBIDDEN", "Недостаточно прав", 403)

    async def _compensate(self, staged: StagedObject) -> None:
        # A commit exception may mean COMMIT reached PostgreSQL but its reply was lost.
        # Check in a fresh session before deleting, or retain a journal for explicit recovery.
        try:
            async with self._uow_factory() as uow:
                referenced = await uow.documents.referenced(staged.stored.key)
            if not referenced:
                await self.storage.delete(staged.stored.key)
            await self.storage.finish(staged)
        except BaseException:
            await self.storage.abandon(staged)

    async def recover_storage(self) -> int:
        async def referenced(key: str) -> bool:
            async with self._uow_factory() as uow:
                return await uow.documents.referenced(key)

        return await self.storage.recover(referenced)

    @staticmethod
    def _version_values(
        identifier: str,
        number: int,
        file: FileMetadata,
        staged: StagedObject,
        actor: Actor,
        comment: str | None = None,
    ) -> NewVersion:
        return NewVersion(identifier, number, file, staged.stored, actor.actor_id, comment or None)

    async def create(
        self, command: DocumentCommand, upload: Upload, context: RequestContext
    ) -> DocumentView:
        assert context.actor is not None
        actor = context.actor
        await self._preflight_create(command, actor)
        file = validate_file(command.filename, upload.mime_type, upload.declared_size, self.maximum)
        staged = await self.storage.stage(upload, self.maximum)
        try:
            await self.storage.promote(staged)
            async with self._uow_factory() as uow:
                access = await current_access(uow, actor, "documents.create")
                target = await uow.documents.links(
                    command.projectId, command.employeeId, command.assetId
                )
                if not access.allows("documents.create", target.permission_target()):
                    raise DomainError("FORBIDDEN", "Недостаточно прав", 403)
                identifier = await uow.documents.create(
                    NewDocument(
                        command.title,
                        command.category,
                        actor.actor_id,
                        command.description or None,
                        command.projectId,
                        command.employeeId,
                        command.assetId,
                    )
                )
                await uow.documents.version(
                    self._version_values(identifier, 1, file, staged, actor)
                )
                await self._audit(
                    uow,
                    context,
                    "DOCUMENT_CREATED",
                    identifier,
                    {
                        "category": command.category,
                        "status": "DRAFT",
                        "version": 1,
                        "mimeType": file.mime_type,
                        "sizeBytes": str(staged.stored.size),
                        "projectId": command.projectId,
                        "employeeId": command.employeeId,
                        "assetId": command.assetId,
                    },
                )
                document = await uow.documents.get(identifier, access, "documents.create")
                assert document is not None
                await uow.commit()
        except BaseException:
            await self._compensate(staged)
            raise
        try:
            await self.storage.finish(staged)
        except OSError:
            await self.storage.abandon(staged)
        return document

    async def generate(self, command: GenerateCommand, context: RequestContext) -> DocumentView:
        assert context.actor is not None
        name = unicodedata.normalize("NFC", command.title)
        name = re.sub(r"\s+", "-", re.sub(r'[<>:"/\\|?*\x00-\x1f]', "-", name))[:80]
        metadata = DocumentCommand(
            command.title,
            name + "." + command.format,
            "ORDER" if command.template == "PERSONNEL_ORDER" else "ACT",
            (
                "Создано по шаблону: "
                + ("приказ" if command.template == "PERSONNEL_ORDER" else "акт")
                + f" ({command.format.upper()})"
            ),
            command.projectId,
            command.employeeId,
            command.assetId,
        )
        await self._preflight_create(metadata, context.actor)
        content = await self.rendering.render(
            command.render_template()
        )  # adapter offloads synchronous rendering

        async def chunks() -> AsyncIterator[bytes]:
            yield content

        mime = (
            "application/pdf"
            if command.format == "pdf"
            else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        return await self.create(metadata, Upload(chunks(), mime, len(content)), context)

    async def _existing(
        self,
        uow: UnitOfWork,
        identifier: str,
        access: AccessContext,
        permission: str,
        lock_version: int,
        *,
        lock: bool,
        version_upload: bool = False,
    ) -> DocumentView:
        document = await uow.documents.get(identifier, access, permission, lock=lock)
        if document is None:
            raise error("NOT_FOUND")
        if version_upload and document.status == "ARCHIVED":
            raise error("INVALID_STATE")
        if document.lockVersion != lock_version:
            raise error("OPTIMISTIC_LOCK_CONFLICT")
        return document

    async def add_version(
        self, identifier: str, command: VersionCommand, upload: Upload, context: RequestContext
    ) -> DocumentView:
        assert context.actor is not None
        actor = context.actor
        access = access_for(actor, "documents.update")
        async with self._uow_factory() as uow:
            preflight = await self._existing(
                uow,
                identifier,
                access,
                "documents.update",
                command.lockVersion,
                lock=False,
                version_upload=True,
            )
            if preflight.status == "ARCHIVED":
                raise error("INVALID_STATE")
        file = validate_file(command.filename, upload.mime_type, upload.declared_size, self.maximum)
        staged = await self.storage.stage(upload, self.maximum)
        try:
            await self.storage.promote(staged)
            async with self._uow_factory() as uow:
                access = await current_access(uow, actor, "documents.update")
                current = await self._existing(
                    uow,
                    identifier,
                    access,
                    "documents.update",
                    command.lockVersion,
                    lock=True,
                    version_upload=True,
                )
                if current.status == "ARCHIVED":
                    raise error("INVALID_STATE")
                number = current.currentVersion + 1
                await uow.documents.version(
                    self._version_values(identifier, number, file, staged, actor, command.comment)
                )
                await uow.documents.update(
                    identifier,
                    DocumentChanges(lockVersion=command.lockVersion + 1, currentVersion=number),
                )
                await self._audit(
                    uow,
                    context,
                    "DOCUMENT_VERSION_ADDED",
                    identifier,
                    {
                        "version": number,
                        "mimeType": file.mime_type,
                        "sizeBytes": str(staged.stored.size),
                    },
                )
                result = await uow.documents.get(identifier, access, "documents.update")
                assert result is not None
                await uow.commit()
        except BaseException:
            await self._compensate(staged)
            raise
        try:
            await self.storage.finish(staged)
        except OSError:
            await self.storage.abandon(staged)
        return result

    async def change_status(
        self, identifier: str, status: str, lock_version: int, context: RequestContext
    ) -> DocumentView:
        return await self._status(identifier, status, lock_version, context)

    async def archive(
        self, identifier: str, lock_version: int, context: RequestContext
    ) -> DocumentView:
        return await self._status(identifier, "ARCHIVED", lock_version, context)

    async def _status(
        self, identifier: str, status: str, lock_version: int, context: RequestContext
    ) -> DocumentView:
        assert context.actor is not None
        permission = "documents.archive" if status == "ARCHIVED" else "documents.update"
        access_for(context.actor, permission)
        async with self._uow_factory() as uow:
            access = await current_access(uow, context.actor, permission)
            current = await self._existing(
                uow, identifier, access, permission, lock_version, lock=True
            )
            previous = current.status
            if (
                (previous == "ARCHIVED")
                if status == "ARCHIVED"
                else not can_transition(previous, status)
            ):
                raise error("INVALID_STATE")
            await uow.documents.update(
                identifier,
                DocumentChanges(
                    lockVersion=lock_version + 1,
                    status=status,
                    archivedAt=datetime.now(UTC).replace(tzinfo=None)
                    if status == "ARCHIVED"
                    else None,
                ),
            )
            await self._audit(
                uow,
                context,
                "DOCUMENT_ARCHIVED" if status == "ARCHIVED" else "DOCUMENT_STATUS_CHANGED",
                identifier,
                {"previousStatus": previous}
                if status == "ARCHIVED"
                else {"from": previous, "to": status},
            )
            result = await uow.documents.get(identifier, access, permission)
            assert result is not None
            await uow.commit()
            return result

    async def download(
        self, identifier: str, number: int | None, context: RequestContext
    ) -> Download:
        assert context.actor is not None
        access = access_for(context.actor, "documents.download")
        async with self._uow_factory() as uow:
            version = await uow.documents.download(identifier, number, access)
            if version is None:
                raise error("NOT_FOUND")
        stored = version.stored
        handle = await self.storage.get(stored)
        try:
            async with self._uow_factory() as uow:
                access = await current_access(uow, context.actor, "documents.download")
                if await uow.documents.download(identifier, number, access) is None:
                    raise error("NOT_FOUND")
                await self._audit(
                    uow,
                    context,
                    "DOCUMENT_DOWNLOADED",
                    identifier,
                    {"version": version.versionNumber},
                )
                await uow.commit()
        except BaseException:
            handle.close()
            raise
        return Download(
            handle,
            stored.size,
            stored.sha256,
            version.originalFilename,
            version.mimeType,
        )
