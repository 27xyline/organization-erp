"""Согласованные копии PostgreSQL и документов; восстановление в новый Compose-проект."""

from __future__ import annotations

import argparse
import copy
import fcntl
import hashlib
import json
import os
import re
import secrets
import shlex
import subprocess
import tarfile
import tempfile
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
FILES = ("database.dump", "documents.tar.gz")
WRITERS = ("app", "worker", "backend")


class BackupError(RuntimeError):
    pass


def run(
    command: Sequence[str],
    *,
    stdin: BinaryIO | None = None,
    stdout: BinaryIO | int = subprocess.PIPE,
) -> bytes:
    result = subprocess.run(
        command, stdin=stdin, stdout=stdout, stderr=subprocess.PIPE, check=False
    )
    if result.returncode:
        detail = result.stderr.decode(errors="replace").strip()[-1200:]
        raise BackupError(f"Команда {command[0]} завершилась с кодом {result.returncode}: {detail}")
    return result.stdout or b""


def checksum(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def verify_backup(directory: Path) -> dict[str, Any]:
    manifest_path = directory / "manifest.json"
    try:
        if manifest_path.is_symlink() or manifest_path.stat().st_size > 1024 * 1024:
            raise BackupError("Некорректный manifest.json")
        manifest = json.loads(manifest_path.read_text())
        if not isinstance(manifest, dict):
            raise BackupError("Некорректный manifest.json")
        if manifest.get("version") != 1 or set(manifest.get("files", {})) != set(FILES):
            raise BackupError("Неизвестный формат резервной копии")
        for name in FILES:
            path = directory / name
            expected = manifest["files"][name]
            if path.is_symlink() or not path.is_file():
                raise BackupError(f"Отсутствует обычный файл {name}")
            if path.stat().st_size != expected["size"] or checksum(path) != expected["sha256"]:
                raise BackupError(f"Нарушена целостность {name}")
        count = 0
        seen = set()
        with tarfile.open(directory / "documents.tar.gz", "r:gz") as archive:
            for member in archive:
                member_path = PurePosixPath(member.name)
                if (
                    member_path.is_absolute()
                    or ".." in member_path.parts
                    or "\\" in member.name
                    or not member_path.parts
                    or member.name in seen
                    or not (member.isfile() or member.isdir())
                ):
                    raise BackupError("Небезопасная запись в архиве документов")
                seen.add(member.name)
                count += int(member.isfile())
        return {**manifest, "document_files": count}
    except (OSError, ValueError, KeyError, TypeError, tarfile.TarError) as error:
        raise BackupError("Не удалось проверить резервную копию") from error


def build_restore_config(
    source: dict[str, Any], project: str, app_port: int, backend_port: int, pg_port: int
) -> dict[str, Any]:
    if project == source["name"] or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{2,62}", project):
        raise BackupError("Нужен новый отдельный Compose-проект с корректным именем")
    if len({app_port, backend_port, pg_port}) != 3 or not all(
        1 <= port <= 65535 for port in (app_port, backend_port, pg_port)
    ):
        raise BackupError("Порты должны быть различными числами от 1 до 65535")
    config = copy.deepcopy(source)
    config["name"] = project
    config["services"].pop("worker", None)
    for key, volume in config["volumes"].items():
        volume["name"] = f"{project}_{key}"
        volume.pop("external", None)
    for key, network in config.get("networks", {}).items():
        network["name"] = f"{project}_{key}"
        network.pop("external", None)
    postgres = config["services"]["postgres"]["environment"]
    postgres["POSTGRES_PASSWORD"] = secrets.token_hex(24)
    url = (
        f"postgresql+asyncpg://{quote(postgres['POSTGRES_USER'], safe='')}:"
        f"{postgres['POSTGRES_PASSWORD']}@postgres:5432/{quote(postgres['POSTGRES_DB'], safe='')}"
    )
    secret = secrets.token_hex(32)
    for name, service in config["services"].items():
        service.pop("container_name", None)
        # Bind mounts remain read-only configuration from this checkout, not source data volumes.
        for mount in service.get("volumes", []):
            if mount["type"] == "bind" and not mount.get("read_only", False):
                raise BackupError(
                    "Восстановление конфигурации с записываемыми bind mounts запрещено"
                )
        if name in {"app", "backend", "postgres"}:
            port = {"app": app_port, "backend": backend_port, "postgres": pg_port}[name]
            target = {"app": 3001, "backend": 8000, "postgres": 5432}[name]
            service["ports"] = [
                {
                    "target": target,
                    "published": str(port),
                    "host_ip": "127.0.0.1",
                    "protocol": "tcp",
                }
            ]
        else:
            service.pop("ports", None)
        env = service.setdefault("environment", {})
        if name in {"backend", "migrate", "worker"}:
            env["BACKEND_DATABASE_URL"] = url
            env["BACKEND_OTEL_ENABLED"] = "false"
            env["BACKEND_ENVIRONMENT"] = "development"
        if name == "backend":
            env["BACKEND_CSRF_SECRET"] = secret
        if name in {"backend", "app"}:
            env["BACKEND_PUBLIC_ORIGIN"] = f"http://127.0.0.1:{app_port}"
        if name == "app":
            env["NEXT_PUBLIC_APP_URL"] = f"http://127.0.0.1:{app_port}"
    return config


class Compose:
    def __init__(self, file: Path, project: str | None = None) -> None:
        self.command = ["docker", "compose", "--project-directory", str(ROOT), "-f", str(file)]
        if project is not None:
            self.command.extend(["--project-name", project])

    def run(
        self, *args: str, stdin: BinaryIO | None = None, stdout: BinaryIO | int = subprocess.PIPE
    ) -> bytes:
        return run([*self.command, *args], stdin=stdin, stdout=stdout)

    def config(self) -> dict[str, Any]:
        config: dict[str, Any] = json.loads(self.run("config", "--format", "json"))
        return config


def create_backup(compose: Compose, output: Path) -> None:
    if output.exists():
        raise BackupError("Каталог резервной копии уже существует")
    config = compose.config()
    running = compose.run("ps", "--services", "--status", "running").decode().splitlines()
    if "postgres" not in running:
        raise BackupError(
            "Для создания копии запустите PostgreSQL через docker compose up -d postgres"
        )
    writers = [name for name in WRITERS if name in running]
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".erp-backup-", dir=output.parent) as temporary:
        staging = Path(temporary) / "snapshot"
        staging.mkdir(mode=0o700)
        try:
            if writers:
                print("Краткая остановка сервисов записи: " + ", ".join(writers), flush=True)
                compose.run("stop", "--timeout", "90", *writers)
            with (staging / FILES[0]).open("wb") as target:
                compose.run(
                    "exec",
                    "-T",
                    "postgres",
                    "sh",
                    "-c",
                    'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" '
                    "--format=custom --no-owner --no-acl",
                    stdout=target,
                )
            storage = config["services"]["backend"]["environment"]["DOCUMENT_STORAGE_ROOT"]
            script = """
import sys, tarfile
from pathlib import Path
root = Path(sys.argv[1])
def regular_only(member):
    if not (member.isfile() or member.isdir()):
        raise RuntimeError('Document storage contains a link or special file')
    return member
with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz') as archive:
    for child in sorted(root.iterdir()):
        archive.add(child, arcname=child.name, filter=regular_only)
"""
            with (staging / FILES[1]).open("wb") as target:
                compose.run(
                    "run",
                    "--rm",
                    "--no-deps",
                    "-T",
                    "--entrypoint",
                    "python",
                    "backend",
                    "-c",
                    script,
                    storage,
                    stdout=target,
                )
            manifest = {
                "version": 1,
                "created_at": datetime.now(UTC).isoformat(),
                "source_project": config["name"],
                "postgres_image": config["services"]["postgres"]["image"],
                "files": {
                    name: {
                        "size": (staging / name).stat().st_size,
                        "sha256": checksum(staging / name),
                    }
                    for name in FILES
                },
            }
            (staging / "manifest.json").write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
            )
            verify_backup(staging)
            for path in staging.iterdir():
                path.chmod(0o600)
            staging.rename(output)
        finally:
            if writers:
                compose.run("start", "--wait", "--wait-timeout", "180", *reversed(writers))
    print(f"Резервная копия создана: {output}")


def restore_backup(
    compose: Compose, archive: Path, project: str, app_port: int, backend_port: int, pg_port: int
) -> Path:
    verify_backup(archive)  # Validate before creating or changing any Docker resources.
    config = build_restore_config(compose.config(), project, app_port, backend_port, pg_port)
    folder = ROOT / ".restore" / project
    if folder.exists():
        raise BackupError("Каталог восстановления уже существует; выберите новое имя проекта")
    existing = set(run(["docker", "volume", "ls", "--format", "{{.Name}}"]).decode().splitlines())
    if existing & {volume["name"] for volume in config["volumes"].values()}:
        raise BackupError("Целевые volumes уже существуют; перезапись запрещена")
    if run(
        ["docker", "ps", "-aq", "--filter", f"label=com.docker.compose.project={project}"]
    ).strip():
        raise BackupError("Целевой Compose-проект уже существует")
    folder.mkdir(parents=True, mode=0o700)
    config_path = folder / "compose.json"
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n")
    config_path.chmod(0o600)
    restored = Compose(config_path, project=project)
    print(f"Восстановление в отдельный проект {project}. Настройки: {config_path}", flush=True)
    restored.run("up", "-d", "--wait", "--wait-timeout", "120", "postgres")
    restored.run("build", "backend")
    with (archive / FILES[0]).open("rb") as source:
        restored.run(
            "exec",
            "-T",
            "postgres",
            "sh",
            "-c",
            'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" '
            "--no-owner --no-acl --exit-on-error",
            stdin=source,
        )
    storage = config["services"]["backend"]["environment"]["DOCUMENT_STORAGE_ROOT"]
    script = """
import sys, tarfile
with tarfile.open(fileobj=sys.stdin.buffer, mode='r|gz') as archive:
    archive.extractall(path=sys.argv[1], filter='data')
"""
    with (archive / FILES[1]).open("rb") as source:
        restored.run(
            "run",
            "--rm",
            "--no-deps",
            "-T",
            "--entrypoint",
            "python",
            "backend",
            "-c",
            script,
            storage,
            stdin=source,
        )
    restored.run(
        "run", "--rm", "--no-deps", "-T", "backend", "python", "-m", "app.scripts.verify_schema"
    )
    result = restored.run(
        "run", "--rm", "--no-deps", "-T", "backend", "python", "-m", "app.scripts.verify_data"
    )
    print(result.decode().strip())
    launch = shlex.join(
        ["docker", "compose", "-p", project, "-f", str(config_path), "up", "-d", "--wait"]
    )
    print("Восстановление и проверка завершены. Для запуска: " + launch)
    return config_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compose-file", type=Path, default=ROOT / "docker-compose.yml")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser(
        "create", help="создать согласованную копию с краткой остановкой записи"
    )
    create.add_argument(
        "--output",
        type=Path,
        default=ROOT / "backups" / datetime.now(UTC).strftime("erp-%Y%m%dT%H%M%SZ"),
    )
    verify = commands.add_parser("verify", help="проверить контрольные суммы и архив документов")
    verify.add_argument("directory", type=Path)
    restore = commands.add_parser("restore", help="восстановить только в новый отдельный проект")
    restore.add_argument("directory", type=Path)
    restore.add_argument("--project", required=True)
    restore.add_argument("--app-port", type=int, default=3101)
    restore.add_argument("--backend-port", type=int, default=8101)
    restore.add_argument("--postgres-port", type=int, default=5541)
    args = parser.parse_args()
    os.umask(0o077)
    compose = Compose(args.compose_file.resolve())
    # Prevent concurrent stop/start cycles against the same source checkout.
    with (ROOT / ".backup.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if args.command == "create":
                create_backup(compose, args.output.resolve())
            elif args.command == "verify":
                result = verify_backup(args.directory.resolve())
                print(f"Копия цела. Файлов документов: {result['document_files']}")
            else:
                restore_backup(
                    compose,
                    args.directory.resolve(),
                    args.project,
                    args.app_port,
                    args.backend_port,
                    args.postgres_port,
                )
        except (BackupError, BlockingIOError) as error:
            parser.exit(1, f"Ошибка: {error}\n")


if __name__ == "__main__":
    main()
