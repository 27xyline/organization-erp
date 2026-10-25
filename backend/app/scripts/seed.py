from __future__ import annotations

import argparse
import asyncio
import re
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.db import registry as _model_registry  # noqa: F401
from app.db.session import create_engine, create_session_factory
from app.domain.documents.records import StagedObject, StoredObject
from app.integrations.document_storage import LocalDocumentStorage
from app.models.documents import DocumentVersion
from app.repositories.cli import DEMO_DOCUMENT_IDS, SqlAlchemyDemoSeedRepository
from app.scripts.cli_support import require_safe_seed_target
from app.services.cli import DemoSeedService

PROJECT_ROOT = Path(__file__).resolve().parents[3]


async def _run(*, allow_local_demo_database: bool = False) -> None:
    settings = Settings()
    database = require_safe_seed_target(
        settings, allow_local_demo_database=allow_local_demo_database
    )
    engine = create_engine(settings)
    storage = LocalDocumentStorage(settings.document_storage_root)
    session_factory = create_session_factory(engine)
    try:
        async with session_factory() as session:
            repository = SqlAlchemyDemoSeedRepository(session, storage)
            try:
                async with session.begin():
                    result = await DemoSeedService(repository).seed()
            except BaseException:
                await _compensate_files(repository.staged_files, storage, session_factory)
                raise

            await _finish_files(repository.staged_files, storage)
        compose_files = await _sync_compose_document_files(settings, storage, session_factory)
        print(f"Демо-данные добавлены в основную БД {database}: {result}")
        if compose_files is None:
            print(
                "Compose backend не запущен; файлы доступны по DOCUMENT_STORAGE_ROOT "
                "из настроек этого процесса."
            )
        else:
            print(f"В Compose backend проверены демо-файлы: {compose_files}")
    finally:
        storage.close()
        await engine.dispose()


async def _finish_files(staged_files: list[StagedObject], storage: LocalDocumentStorage) -> None:
    for staged in staged_files:
        try:
            await storage.finish(staged)
        except OSError:
            # Объект уже зафиксирован в БД; оставить аренду для штатного восстановления.
            await storage.abandon(staged)


async def _compensate_files(
    staged_files: list[StagedObject],
    storage: LocalDocumentStorage,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    for staged in reversed(staged_files):
        try:
            async with session_factory() as session:
                referenced = await session.scalar(
                    select(DocumentVersion.id)
                    .where(DocumentVersion.storageKey == staged.stored.key)
                    .limit(1)
                )
            if referenced is None:
                await storage.delete(staged.stored.key)
            await storage.finish(staged)
        except BaseException:
            # Если результат COMMIT неизвестен, журнал аренды позволит сверить ключ с БД.
            await storage.abandon(staged)


async def _sync_compose_document_files(
    settings: Settings,
    storage: LocalDocumentStorage,
    session_factory: async_sessionmaker[AsyncSession],
) -> int | None:
    project_root = PROJECT_ROOT
    compose = (
        "docker",
        "compose",
        "-f",
        str(project_root / "docker-compose.yml"),
        "-f",
        str(project_root / "docker-compose.dev.yml"),
    )
    try:
        process = await asyncio.create_subprocess_exec(
            *compose,
            "ps",
            "--services",
            "--filter",
            "status=running",
            cwd=project_root,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        return None
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        detail = stderr.decode().strip() or stdout.decode().strip()
        raise RuntimeError(f"Не удалось проверить состояние Compose backend: {detail}")
    if "backend" not in stdout.decode().splitlines():
        return None

    async with session_factory() as session:
        rows = (
            await session.execute(
                select(
                    DocumentVersion.storageKey,
                    DocumentVersion.sizeBytes,
                    DocumentVersion.sha256,
                )
                .where(
                    DocumentVersion.documentId.in_(DEMO_DOCUMENT_IDS),
                    DocumentVersion.versionNumber == 1,
                )
                .order_by(DocumentVersion.documentId)
            )
        ).all()

    prepare_script = """
import os
import pwd
import stat
import sys

path = sys.argv[1]
if not stat.S_ISREG(os.lstat(path).st_mode):
    raise SystemExit("temporary transfer is not a regular file")
owner = pwd.getpwnam("app")
os.chown(path, owner.pw_uid, owner.pw_gid, follow_symlinks=False)
os.chmod(path, 0o600, follow_symlinks=False)
"""
    copy_script = """
import hashlib
import os
import re
import stat
import sys
from uuid import uuid4
from pathlib import Path

source = Path(sys.argv[1])
key = sys.argv[2]
expected_size = int(sys.argv[3])
expected_digest = sys.argv[4]
if not re.fullmatch(r"[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}", key):
    raise SystemExit("invalid storage key")
root = Path(os.environ["DOCUMENT_STORAGE_ROOT"])
if not root.is_absolute() or ".." in root.parts:
    raise SystemExit("invalid document storage root")
directory_flag = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
file_name = key.split("/")[-1]
temporary_name = None
directory = os.open("/", directory_flag)

def open_child(parent, part):
    try:
        os.mkdir(part, 0o700, dir_fd=parent)
    except FileExistsError:
        pass
    else:
        os.fsync(parent)
    return os.open(part, directory_flag, dir_fd=parent)

try:
    for part in root.parts[1:]:
        child = open_child(directory, part)
        os.close(directory)
        directory = child
    for part in key.split("/")[:2]:
        child = open_child(directory, part)
        os.close(directory)
        directory = child

    existing = None
    try:
        existing = os.open(
            file_name,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=directory,
        )
    except FileNotFoundError:
        pass
    if existing is not None:
        try:
            if not stat.S_ISREG(os.fstat(existing).st_mode):
                raise SystemExit("stored object is not a regular file")
            current_hash = hashlib.sha256()
            current_size = 0
            while True:
                chunk = os.read(existing, 65536)
                if not chunk:
                    break
                current_size += len(chunk)
                current_hash.update(chunk)
            if current_size == expected_size and current_hash.hexdigest() == expected_digest:
                source.unlink()
                raise SystemExit(0)
        finally:
            os.close(existing)

    temporary_name = file_name + "." + uuid4().hex + ".tmp"
    source_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    temporary_fd = os.open(
        temporary_name,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o600,
        dir_fd=directory,
    )
    try:
        if not stat.S_ISREG(os.fstat(source_fd).st_mode):
            raise SystemExit("transfer source is not a regular file")
        digest = hashlib.sha256()
        total = 0
        while True:
            chunk = os.read(source_fd, 65536)
            if not chunk:
                break
            total += len(chunk)
            digest.update(chunk)
            offset = 0
            while offset < len(chunk):
                written = os.write(temporary_fd, chunk[offset:])
                if written <= 0:
                    raise OSError("short write while syncing demo file")
                offset += written
        os.fsync(temporary_fd)
    finally:
        os.close(source_fd)
        os.close(temporary_fd)
    if total != expected_size or digest.hexdigest() != expected_digest:
        raise SystemExit("transfer source size or digest mismatch")
    os.replace(
        temporary_name,
        file_name,
        src_dir_fd=directory,
        dst_dir_fd=directory,
    )
    temporary_name = None
    os.fsync(directory)
    source.unlink()
finally:
    if temporary_name is not None:
        try:
            os.unlink(temporary_name, dir_fd=directory)
        except FileNotFoundError:
            pass
    os.close(directory)
    try:
        source.unlink()
    except FileNotFoundError:
        pass
"""
    checked = 0
    for storage_key, size_bytes, sha256 in rows:
        if not re.fullmatch(r"[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}", storage_key):
            raise RuntimeError("Демо-документ содержит некорректный ключ хранилища")
        handle = await storage.get(StoredObject(storage_key, size_bytes, sha256))
        handle.close()
        temporary_name = f"/tmp/demo-seed-{uuid4().hex}"
        source_path = Path(settings.document_storage_root).joinpath(*storage_key.split("/"))
        copied = await _run_compose(
            compose,
            project_root,
            "cp",
            str(source_path),
            f"backend:{temporary_name}",
        )
        if copied is None:
            raise RuntimeError("Не удалось передать демо-файл в Compose backend")
        prepared = await _run_compose(
            compose,
            project_root,
            "exec",
            "-T",
            "-u",
            "0",
            "backend",
            "python",
            "-c",
            prepare_script,
            temporary_name,
        )
        if prepared is None:
            raise RuntimeError("Не удалось подготовить временный демо-файл в Compose backend")
        synced = await _run_compose(
            compose,
            project_root,
            "exec",
            "-T",
            "backend",
            "python",
            "-c",
            copy_script,
            temporary_name,
            storage_key,
            str(size_bytes),
            sha256,
        )
        if synced is None:
            raise RuntimeError("Не удалось синхронизировать демо-файл с Compose backend")
        checked += 1
    return checked


async def _run_compose(compose: tuple[str, ...], project_root: Path, *arguments: str) -> str | None:
    try:
        process = await asyncio.create_subprocess_exec(
            *compose,
            *arguments,
            cwd=project_root,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        return None
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        detail = stderr.decode().strip() or stdout.decode().strip()
        raise RuntimeError(f"Не удалось синхронизировать демо-файл с Compose: {detail}")
    return stdout.decode()


def main() -> None:
    parser = argparse.ArgumentParser(description="Добавить учебные демо-данные в локальную БД")
    parser.add_argument(
        "--allow-local-demo-db",
        action="store_true",
        help="разрешить заполнение локальной базы organization_erp_dev в development",
    )
    args = parser.parse_args()
    asyncio.run(_run(allow_local_demo_database=args.allow_local_demo_db))


if __name__ == "__main__":
    main()
