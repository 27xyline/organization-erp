import hashlib
import io
import json
import os
import shutil
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from erp_backup import BackupError, Compose, build_restore_config, create_backup, verify_backup


class BackupTests(unittest.TestCase):
    def fixture(self, root, member="files/document.bin", kind=None):
        (root / "database.dump").write_bytes(b"PGDMP test")
        with tarfile.open(root / "documents.tar.gz", "w:gz") as archive:
            info = tarfile.TarInfo(member)
            if kind:
                info.type = kind
                info.linkname = "/outside"
                archive.addfile(info)
            else:
                info.size = 8
                archive.addfile(info, io.BytesIO(b"document"))
        manifest = {"version": 1, "files": {}}
        for name in ["database.dump", "documents.tar.gz"]:
            content = (root / name).read_bytes()
            manifest["files"][name] = {
                "sha256": hashlib.sha256(content).hexdigest(),
                "size": len(content),
            }
        (root / "manifest.json").write_text(json.dumps(manifest))

    def test_verifies_archive_without_extracting_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            self.assertEqual(verify_backup(root)["document_files"], 1)
            self.assertFalse((root / "files").exists())

    def test_rejects_modified_dump_before_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            (root / "database.dump").write_bytes(b"changed")
            with self.assertRaises(BackupError):
                verify_backup(root)

    def test_rejects_traversal_and_links_even_with_matching_checksums(self):
        for member, kind in [
            ("../outside", None),
            ("/outside", None),
            ("link", tarfile.SYMTYPE),
            ("link", tarfile.LNKTYPE),
        ]:
            with self.subTest(member=member, kind=kind), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.fixture(root, member, kind)
                with self.assertRaises(BackupError):
                    verify_backup(root)

    def config(self):
        return {
            "name": "organization-erp",
            "services": {
                "postgres": {
                    "environment": {
                        "POSTGRES_USER": "app",
                        "POSTGRES_DB": "erp",
                        "POSTGRES_PASSWORD": "original",
                    }
                },
                "backend": {"environment": {}},
                "migrate": {"environment": {}},
                "worker": {"environment": {}},
                "app": {"environment": {}},
            },
            "volumes": {"db": {"name": "live-db"}, "docs": {"name": "live-docs"}},
            "networks": {"default": {"name": "live-network"}},
        }

    def test_restore_uses_distinct_volumes_network_and_local_ports(self):
        source = self.config()
        restored = build_restore_config(source, "erp-recovery-check", 3101, 8101, 5541)
        self.assertNotIn("worker", restored["services"])
        self.assertEqual(source["volumes"]["db"]["name"], "live-db")
        self.assertEqual(restored["volumes"]["db"]["name"], "erp-recovery-check_db")
        self.assertEqual(restored["networks"]["default"]["name"], "erp-recovery-check_default")
        self.assertEqual(restored["services"]["postgres"]["ports"][0]["published"], "5541")
        self.assertEqual(restored["services"]["app"]["ports"][0]["host_ip"], "127.0.0.1")
        self.assertNotEqual(
            restored["services"]["postgres"]["environment"]["POSTGRES_PASSWORD"], "original"
        )

    def test_rejects_restore_into_source_project(self):
        with self.assertRaises(BackupError):
            build_restore_config(self.config(), "organization-erp", 3101, 8101, 5541)


class BackupLifecycleTests(unittest.TestCase):
    class Daemon:
        def __init__(self, fail_at=None):
            self.running = {"app", "backend", "postgres"}
            self.fail_at = fail_at

        def config(self):
            return {
                "name": "source",
                "services": {
                    "postgres": {"image": "postgres:18.6-alpine"},
                    "backend": {"environment": {"DOCUMENT_STORAGE_ROOT": "/documents"}},
                },
            }

        def run(self, *args, stdout=None, **kwargs):
            if args[0] == "ps":
                return "\n".join(self.running).encode()
            if args[0] == "stop":
                self.running.discard("app")
                if self.fail_at == "stop":
                    raise BackupError("partial stop failed")
                self.running.discard("backend")
            elif args[0] == "start":
                if self.fail_at == "start":
                    raise BackupError("restart failed")
                self.running.update(args[4:])
            elif args[0] == "exec":
                if self.fail_at == "dump":
                    raise BackupError("dump failed")
                stdout.write(b"PGDMP test")
            elif args[0] == "run":
                if self.fail_at == "tar":
                    raise BackupError("tar failed")
                if self.fail_at == "verify":
                    stdout.write(b"invalid archive")
                else:
                    with tarfile.open(fileobj=stdout, mode="w:gz") as archive:
                        info = tarfile.TarInfo("document.bin")
                        info.size = 8
                        archive.addfile(info, io.BytesIO(b"document"))
            return b""

    def test_failed_backup_resumes_original_services_and_leaves_no_snapshot(self):
        for failure in ["stop", "dump", "tar", "verify"]:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                daemon = self.Daemon(failure)
                output = Path(directory) / "snapshot"
                with self.assertRaises(BackupError):
                    create_backup(daemon, output)
                self.assertEqual(daemon.running, {"app", "backend", "postgres"})
                self.assertFalse(output.exists())
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_success_resumes_only_services_that_were_running(self):
        with tempfile.TemporaryDirectory() as directory:
            daemon = self.Daemon()
            output = Path(directory) / "snapshot"
            create_backup(daemon, output)
            self.assertEqual(daemon.running, {"app", "backend", "postgres"})
            self.assertEqual(verify_backup(output)["document_files"], 1)
            self.assertEqual((output / "database.dump").stat().st_mode & 0o777, 0o600)

    def test_restart_failure_is_reported_but_completed_snapshot_is_kept(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "snapshot"
            with self.assertRaisesRegex(BackupError, "restart failed"):
                create_backup(self.Daemon("start"), output)
            self.assertEqual(verify_backup(output)["document_files"], 1)

    @unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI is required")
    def test_explicit_restore_project_overrides_source_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            config = {
                "name": "recovery",
                "services": {"postgres": {"image": "postgres:18.6-alpine"}},
            }
            path = Path(directory) / "compose.json"
            path.write_text(json.dumps(config))
            with patch.dict(os.environ, {"COMPOSE_PROJECT_NAME": "production"}):
                self.assertEqual(Compose(path, project="recovery").config()["name"], "recovery")


if __name__ == "__main__":
    unittest.main()
