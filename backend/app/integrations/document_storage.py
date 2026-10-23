"""Private local objects with fd-relative no-follow access and recoverable leases.

Every upload journals its key before promotion. A locked pending journal protects an
active transaction. Recovery is explicit, must run against the owning database,
and removes only unlocked journals after checking that database for references.
"""

from __future__ import annotations

import asyncio
import fcntl
import hashlib
import os
import re
import stat
import tempfile
import weakref
from collections.abc import Awaitable, Callable
from pathlib import Path
from threading import Lock
from typing import Any, BinaryIO
from uuid import UUID, uuid4

from app.domain.documents.records import StagedObject, StoredObject, UploadStream
from app.domain.errors import DomainError

KEY = re.compile(r"^[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}$")
DIR = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


async def _owned_thread[T](
    operation: Callable[..., T], *args: object, cancelled: Callable[[T], None] | None = None
) -> T:
    """Wait for our OS worker even after cancellation before exposing ownership."""
    worker = asyncio.create_task(asyncio.to_thread(operation, *args))
    interrupted = False
    while True:
        try:
            result = await asyncio.shield(worker)
            break
        except asyncio.CancelledError:
            interrupted = True
        except BaseException:
            if interrupted:
                raise asyncio.CancelledError from None
            raise
    if interrupted:
        if cancelled is not None:
            await _owned_thread(cancelled, result)
        raise asyncio.CancelledError
    return result


class LocalDocumentStorage:
    def __init__(self, root: Path, project_root: Path | None = None) -> None:
        self.root = Path(os.path.abspath(root))
        # Only fixed OS aliases are trusted. Mutable application symlink ancestors
        # are rejected by the subsequent fd-relative O_NOFOLLOW walk.
        for alias, destination in (
            (Path("/var"), Path("/private/var")),
            (Path("/tmp"), Path("/private/tmp")),
        ):
            if (self.root == alias or alias in self.root.parents) and alias.is_symlink():
                if alias.resolve() != destination:
                    raise DomainError("INVALID_STORAGE_ROOT", "Недопустимый путь хранилища", 422)
                self.root = destination / self.root.relative_to(alias)
        project = (project_root or Path(__file__).resolve().parents[3]).resolve()
        effective = self.root.resolve()
        if effective == project or any(
            effective == project / name or project / name in effective.parents
            for name in ("public", "src", ".next", ".next-dev", "node_modules")
        ):
            raise DomainError(
                "INVALID_STORAGE_ROOT",
                "Хранилище документов не может находиться в публичном каталоге или каталоге сборки",
                422,
            )
        self._root_fd: int | None = None
        self._root_guard = Lock()
        self._root_finalizer: weakref.finalize[Any, Any] | None = None
        self._closed = False

    def _root(self) -> int:
        with self._root_guard:
            if self._closed:
                raise RuntimeError("Document storage is closed")
            if self._root_fd is None:
                current = os.open("/", DIR)
                try:
                    for part in self.root.parts[1:]:
                        try:
                            os.mkdir(part, 0o700, dir_fd=current)
                            os.fsync(current)
                        except FileExistsError:
                            pass
                        child = os.open(part, DIR, dir_fd=current)
                        os.close(current)
                        current = child
                    os.fchmod(current, 0o700)
                except OSError as error:
                    os.close(current)
                    raise DomainError(
                        "INVALID_STORAGE_ROOT", "Недопустимый путь хранилища", 422
                    ) from error
                self._root_fd = current
                self._root_finalizer = weakref.finalize(self, os.close, current)
            return os.dup(self._root_fd)

    def close(self) -> None:
        with self._root_guard:
            self._closed = True
            if self._root_finalizer is not None:
                self._root_finalizer()
            self._root_fd = None

    def _directory(self, parts: tuple[str, ...], *, create: bool = False) -> int:
        current = self._root()
        try:
            for part in parts:
                if create:
                    try:
                        os.mkdir(part, 0o700, dir_fd=current)
                        os.fsync(current)
                    except FileExistsError:
                        pass
                child = os.open(part, DIR, dir_fd=current)
                os.close(current)
                current = child
            return current
        except BaseException:
            os.close(current)
            raise

    def _parts(self, key: str) -> tuple[str, str, str]:
        if not KEY.fullmatch(key):
            raise DomainError("INVALID_STORAGE_KEY", "Некорректный ключ хранения", 422)
        first, second, name = key.split("/")
        return first, second, name

    def _stage_start(self) -> tuple[str, BinaryIO, BinaryIO]:
        identifier = str(uuid4())
        key = f"{identifier[:2]}/{identifier[2:4]}/{identifier}"
        directory = self._directory((".staging",), create=True)
        lease: BinaryIO | None = None
        try:
            # _directory opens .staging afresh, never dup's its description. This
            # kernel lock coordinates both processes and threads of this object.
            # Recovery cannot observe a published name before its first lease.
            fcntl.flock(directory, fcntl.LOCK_EX)
            fd = os.open(
                identifier + ".pending",
                os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
                dir_fd=directory,
            )
            lease = os.fdopen(fd, "r+b")
            fcntl.flock(fd, fcntl.LOCK_EX)
            lease.write(key.encode("ascii"))
            lease.flush()
            os.fsync(fd)
            os.fsync(directory)
            temp_fd = os.open(
                identifier + ".tmp",
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
                dir_fd=directory,
            )
            return key, lease, os.fdopen(temp_fd, "wb")
        except BaseException:
            if lease is not None:
                lease.close()
            # A partially initialized journal remains recoverable by its UUID.
            raise
        finally:
            os.close(directory)

    def _cancel_start(self, started: tuple[str, BinaryIO, BinaryIO]) -> None:
        key, lease, output = started
        output.close()
        self._finish(StagedObject(StoredObject(key, 0, ""), lease))

    async def stage(self, upload: UploadStream, maximum: int) -> StagedObject:
        key, lease, output = await _owned_thread(self._stage_start, cancelled=self._cancel_start)
        total = 0
        digest = hashlib.sha256()
        try:
            async for chunk in upload.chunks:
                total += len(chunk)
                if total > maximum:
                    raise DomainError("FILE_TOO_LARGE", "Превышен допустимый размер файла", 422)
                await _owned_thread(self._write, output, digest, chunk)
            if not total:
                raise DomainError("EMPTY_FILE", "Файл пуст", 422)
            await _owned_thread(self._sync_close, output)
            return StagedObject(StoredObject(key, total, digest.hexdigest()), lease)
        except BaseException:
            output.close()
            staged = StagedObject(StoredObject(key, total, ""), lease)
            await self.finish(staged)
            raise

    @staticmethod
    def _write(output: BinaryIO, digest: Any, chunk: bytes) -> None:
        output.write(chunk)
        # hashlib implementations expose a stable update method.
        digest.update(chunk)

    @staticmethod
    def _sync_close(output: BinaryIO) -> None:
        output.flush()
        os.fsync(output.fileno())
        output.close()

    def _promote(self, staged: StagedObject) -> None:
        first, second, name = self._parts(staged.stored.key)
        source = self._directory((".staging",))
        destination: int | None = None
        try:
            destination = self._directory((first, second), create=True)
            # link is exclusive; a UUID collision cannot overwrite an existing object.
            os.link(
                name + ".tmp",
                name,
                src_dir_fd=source,
                dst_dir_fd=destination,
                follow_symlinks=False,
            )
            os.fsync(destination)
            os.unlink(name + ".tmp", dir_fd=source)
            os.fsync(source)
        finally:
            if destination is not None:
                os.close(destination)
            os.close(source)

    async def promote(self, staged: StagedObject) -> None:
        await _owned_thread(self._promote, staged)

    def _finish(self, staged: StagedObject) -> None:
        name = self._parts(staged.stored.key)[2]
        directory: int | None = None
        try:
            directory = self._directory((".staging",))
            for suffix in (".tmp", ".pending"):
                try:
                    os.unlink(name + suffix, dir_fd=directory)
                except FileNotFoundError:
                    pass
            os.fsync(directory)
        finally:
            if directory is not None:
                os.close(directory)
            staged.lease.close()

    async def finish(self, staged: StagedObject) -> None:
        await _owned_thread(self._finish, staged)

    async def abandon(self, staged: StagedObject) -> None:
        # Keep journal for reconciliation if commit acknowledgement is uncertain.
        await _owned_thread(staged.lease.close)

    def _get(self, stored: StoredObject) -> BinaryIO:
        first, second, name = self._parts(stored.key)
        source: BinaryIO | None = None
        snapshot: BinaryIO | None = None
        try:
            directory = self._directory((first, second))
            try:
                source = os.fdopen(
                    os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory),
                    "rb",
                )
            finally:
                os.close(directory)
            if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                raise OSError("Nonregular object")
            snapshot = tempfile.TemporaryFile(mode="w+b")
            digest = hashlib.sha256()
            size = 0
            while chunk := source.read(65536):
                size += len(chunk)
                digest.update(chunk)
                snapshot.write(chunk)
                if size > stored.size:
                    raise OSError("Integrity mismatch")
            if size != stored.size or digest.hexdigest() != stored.sha256:
                raise OSError("Integrity mismatch")
            source.close()
            snapshot.seek(0)
            return snapshot
        except (OSError, ValueError) as error:
            if source:
                source.close()
            if snapshot:
                snapshot.close()
            raise DomainError(
                "STORAGE_CORRUPTED", "Файл повреждён или отсутствует в хранилище", 503
            ) from error

    async def get(self, stored: StoredObject) -> BinaryIO:
        return await _owned_thread(self._get, stored, cancelled=lambda handle: handle.close())

    def _delete(self, key: str) -> None:
        first, second, name = self._parts(key)
        try:
            directory = self._directory((first, second))
        except FileNotFoundError:
            return
        try:
            os.unlink(name, dir_fd=directory)
            os.fsync(directory)
        except FileNotFoundError:
            pass
        finally:
            os.close(directory)

    async def delete(self, key: str) -> None:
        await _owned_thread(self._delete, key)

    def _leases(self) -> list[StagedObject]:
        directory = self._directory((".staging",), create=True)
        leases = []
        try:
            # Hold only for publication/enumeration, not DB reconciliation.
            # Once acquired, every visible journal's creator either established
            # its file lease or died while the OS released this directory lock.
            fcntl.flock(directory, fcntl.LOCK_EX)
            for name in os.listdir(directory):
                if not re.fullmatch(r"[0-9a-f-]{36}\.pending", name):
                    continue
                try:
                    handle = os.fdopen(
                        os.open(name, os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory),
                        "r+b",
                    )
                    try:
                        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        handle.close()
                        continue
                    try:
                        identifier = name.removesuffix(".pending")
                        if str(UUID(identifier)) != identifier:
                            raise ValueError("Noncanonical journal UUID")
                        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
                            raise ValueError("Nonregular journal")
                        key = f"{identifier[:2]}/{identifier[2:4]}/{identifier}"
                        # Empty/prefix content is an interrupted initialization.
                        # Anything else is retained for operator investigation.
                        if not key.encode("ascii").startswith(handle.read(200)):
                            raise ValueError("Journal does not match its canonical candidate")
                    except BaseException:
                        handle.close()
                        raise
                    leases.append(StagedObject(StoredObject(key, 0, ""), handle))
                except FileNotFoundError:
                    continue
            return leases
        except BaseException:
            self._close_leases(leases)
            raise
        finally:
            os.close(directory)

    @staticmethod
    def _close_leases(leases: list[StagedObject]) -> None:
        for staged in leases:
            staged.lease.close()

    async def recover(self, referenced: Callable[[str], Awaitable[bool]]) -> int:
        leases = await _owned_thread(self._leases, cancelled=self._close_leases)
        recovered = 0
        try:
            for staged in leases:
                if not await referenced(staged.stored.key):
                    await self.delete(staged.stored.key)
                    recovered += 1
                await self.finish(staged)
            return recovered
        finally:
            for staged in leases:
                staged.lease.close()
