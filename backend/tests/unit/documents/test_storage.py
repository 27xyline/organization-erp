import pytest

from app.domain.errors import DomainError
from app.integrations.document_storage import LocalDocumentStorage
from app.services.dto.documents import StoredObject, Upload

pytestmark = pytest.mark.anyio


async def chunks(content):
    for offset in range(0, len(content), 3):
        yield content[offset : offset + 3]


async def test_stage_promote_read_and_orphan_recovery(tmp_path):
    storage = LocalDocumentStorage(tmp_path)
    staged = await storage.stage(Upload(chunks(b"hello world")), 100)
    assert not (tmp_path / staged.stored.key).exists()
    await storage.promote(staged)
    handle = await storage.get(staged.stored)
    assert handle.read() == b"hello world"
    handle.close()

    async def unreferenced(key):
        return False

    assert await storage.recover(unreferenced) == 0
    await storage.abandon(staged)
    assert await storage.recover(unreferenced) == 1
    assert not (tmp_path / staged.stored.key).exists()
    assert await storage.recover(unreferenced) == 0


async def test_size_corruption_and_symlink_protection(tmp_path):
    storage = LocalDocumentStorage(tmp_path)
    with pytest.raises(DomainError) as error:
        await storage.stage(Upload(chunks(b"123456")), 5)
    assert error.value.code == "FILE_TOO_LARGE"
    assert list((tmp_path / ".staging").iterdir()) == []
    staged = await storage.stage(Upload(chunks(b"1234")), 5)
    await storage.promote(staged)
    await storage.finish(staged)
    path = tmp_path / staged.stored.key
    path.write_bytes(b"bad!")
    with pytest.raises(DomainError) as error:
        await storage.get(staged.stored)
    assert error.value.code == "STORAGE_CORRUPTED"
    path.unlink()
    path.symlink_to("/etc/hosts")
    with pytest.raises(DomainError):
        await storage.get(staged.stored)
    with pytest.raises(DomainError):
        await storage.get(StoredObject("../../etc/hosts", 1, "0" * 64))


async def test_committed_journal_recovery_preserves_object_and_snapshot(tmp_path):
    storage = LocalDocumentStorage(tmp_path)
    staged = await storage.stage(Upload(chunks(b"original")), 100)
    await storage.promote(staged)
    snapshot = await storage.get(staged.stored)
    (tmp_path / staged.stored.key).write_bytes(b"mutated!")
    assert snapshot.read() == b"original"
    snapshot.close()
    await storage.abandon(staged)

    async def referenced(key):
        return key == staged.stored.key

    assert await storage.recover(referenced) == 0
    assert (tmp_path / staged.stored.key).exists()
    assert list((tmp_path / ".staging").iterdir()) == []


async def test_pre_promote_crash_and_recovery_database_failure(tmp_path):
    storage = LocalDocumentStorage(tmp_path)
    staged = await storage.stage(Upload(chunks(b"hello")), 100)
    await storage.abandon(staged)

    async def unavailable(key):
        raise ConnectionError("DB unavailable")

    with pytest.raises(ConnectionError):
        await storage.recover(unavailable)
    assert len(list((tmp_path / ".staging").iterdir())) == 2

    async def unreferenced(key):
        return False

    assert await storage.recover(unreferenced) == 1
    assert list((tmp_path / ".staging").iterdir()) == []


async def test_stream_error_cleans_stage_and_symlinked_shard_is_rejected(tmp_path):
    storage = LocalDocumentStorage(tmp_path)

    async def broken():
        yield b"abc"
        raise OSError("source failed")

    with pytest.raises(OSError):
        await storage.stage(Upload(broken()), 100)
    assert list((tmp_path / ".staging").iterdir()) == []
    outside = tmp_path / "outside"
    outside.mkdir()
    (tmp_path / "aa").symlink_to(outside, target_is_directory=True)
    with pytest.raises(DomainError):
        await storage.get(StoredObject("aa/bb/" + "0" * 36, 1, "f" * 64))
    assert list(outside.iterdir()) == []


async def test_fsync_failure_leaves_no_temp_or_journal(tmp_path, monkeypatch):
    storage = LocalDocumentStorage(tmp_path)

    def fail(output):
        raise OSError("fsync injected")

    monkeypatch.setattr(storage, "_sync_close", fail)
    with pytest.raises(OSError, match="fsync injected"):
        await storage.stage(Upload(chunks(b"hello")), 100)
    assert list((tmp_path / ".staging").iterdir()) == []


@pytest.mark.parametrize("alias", ["dotdot", "symlink"])
async def test_effective_public_root_alias_is_rejected(tmp_path, alias):
    project = tmp_path / "project"
    (project / "public").mkdir(parents=True)
    (project / ".runtime").mkdir()
    if alias == "dotdot":
        root = project / ".runtime" / ".." / "public" / "documents"
    else:
        (project / "alias").symlink_to(project / "public", target_is_directory=True)
        root = project / "alias" / "documents"
    with pytest.raises(DomainError) as error:
        storage = LocalDocumentStorage(root, project_root=project)
        await storage.stage(Upload(chunks(b"hello")), 100)
    assert error.value.code == "INVALID_STORAGE_ROOT"
    assert not (project / "public" / "documents").exists()


async def test_root_pin_survives_ancestor_replacement_and_close_releases_fd(tmp_path):
    import os

    ancestor = tmp_path / "live"
    root = ancestor / "documents"
    storage = LocalDocumentStorage(root)
    staged = await storage.stage(Upload(chunks(b"hello")), 100)
    moved = tmp_path / "original"
    ancestor.rename(moved)
    outside = tmp_path / "outside"
    outside.mkdir()
    ancestor.symlink_to(outside, target_is_directory=True)
    await storage.promote(staged)
    await storage.finish(staged)
    assert (moved / "documents" / staged.stored.key).read_bytes() == b"hello"
    assert list(outside.iterdir()) == []
    pinned = storage._root_fd
    storage.close()
    storage.close()
    with pytest.raises(OSError):
        os.fstat(pinned)
    with pytest.raises(RuntimeError):
        await storage.get(staged.stored)


async def test_mutable_nonpublic_symlink_ancestor_is_rejected(tmp_path):
    target = tmp_path / "private"
    target.mkdir()
    (tmp_path / "alias").symlink_to(target, target_is_directory=True)
    storage = LocalDocumentStorage(tmp_path / "alias" / "documents")
    with pytest.raises(DomainError) as error:
        await storage.stage(Upload(chunks(b"hello")), 100)
    assert error.value.code == "INVALID_STORAGE_ROOT"
    assert list(target.iterdir()) == []


async def test_trusted_macos_var_alias_can_be_used(tmp_path):
    import sys
    from pathlib import Path

    if sys.platform != "darwin" or not str(tmp_path).startswith("/private/var/"):
        pytest.skip("macOS /var alias coverage")
    storage = LocalDocumentStorage(
        Path("/var") / tmp_path.relative_to("/private/var") / "documents"
    )
    staged = await storage.stage(Upload(chunks(b"hello")), 100)
    await storage.promote(staged)
    handle = await storage.get(staged.stored)
    assert handle.read() == b"hello"
    handle.close()
    await storage.finish(staged)
    storage.close()


async def test_interrupted_journal_initialization_recovers_alongside_valid_orphan(tmp_path):
    storage = LocalDocumentStorage(tmp_path)
    staged = []
    for value in (b"one", b"two", b"three"):
        candidate = await storage.stage(Upload(chunks(value)), 100)
        await storage.promote(candidate)
        await storage.abandon(candidate)
        staged.append(candidate)
    for candidate, value in zip(staged[:2], (b"", staged[1].stored.key[:3].encode()), strict=True):
        journal = tmp_path / ".staging" / (candidate.stored.key.split("/")[-1] + ".pending")
        journal.write_bytes(value)
    checked = []

    async def unreferenced(key):
        checked.append(key)
        return False

    assert await storage.recover(unreferenced) == 3
    assert set(checked) == {candidate.stored.key for candidate in staged}
    assert [path for path in tmp_path.rglob("*") if path.is_file()] == []
    assert await storage.recover(unreferenced) == 0


async def test_cancelled_stage_creation_closes_resources_before_propagating(tmp_path, monkeypatch):
    import asyncio
    import threading

    storage = LocalDocumentStorage(tmp_path)
    entered = threading.Event()
    release = threading.Event()
    owned = []
    original = storage._stage_start

    def blocked_start():
        result = original()
        owned.append(result)
        entered.set()
        assert release.wait(5)
        return result

    monkeypatch.setattr(storage, "_stage_start", blocked_start)
    task = asyncio.create_task(storage.stage(Upload(chunks(b"hello")), 100))
    try:
        assert await asyncio.to_thread(entered.wait, 5)
        task.cancel()
        await asyncio.sleep(0.02)
        assert not task.done()
    finally:
        release.set()
        result = await asyncio.gather(task, return_exceptions=True)
    assert isinstance(result[0], asyncio.CancelledError)
    assert owned[0][1].closed and owned[0][2].closed
    assert [p for p in tmp_path.rglob("*") if p.is_file()] == []
    storage.close()


async def test_unknown_corrupt_journal_is_retained_and_does_not_leak_other_leases(tmp_path):
    storage = LocalDocumentStorage(tmp_path)
    valid = await storage.stage(Upload(chunks(b"hello")), 100)
    await storage.promote(valid)
    await storage.abandon(valid)
    corrupt = await storage.stage(Upload(chunks(b"other")), 100)
    await storage.promote(corrupt)
    await storage.abandon(corrupt)
    journal = tmp_path / ".staging" / (corrupt.stored.key.split("/")[-1] + ".pending")
    journal.write_bytes(b"unknown candidate")

    async def unreferenced(key):
        return False

    with pytest.raises(ValueError, match="canonical candidate"):
        await storage.recover(unreferenced)
    assert journal.exists()
    assert (tmp_path / corrupt.stored.key).exists()
    # Repair the known test journal, then prove every earlier lease was released.
    journal.write_bytes(corrupt.stored.key.encode())
    assert await storage.recover(unreferenced) == 2
    assert await storage.recover(unreferenced) == 0
    storage.close()


def _recover_in_another_process(root, ready, connection):
    import asyncio

    storage = LocalDocumentStorage(root)

    async def unreferenced(key):
        return False

    async def run():
        ready.set()
        return await storage.recover(unreferenced)

    try:
        connection.send(("ok", asyncio.run(run())))
    except BaseException as error:
        connection.send(("error", repr(error)))
    finally:
        storage.close()
        connection.close()


async def test_recovery_cannot_unpublish_a_journal_before_creator_flocks(tmp_path, monkeypatch):
    import asyncio
    import fcntl
    import multiprocessing
    import os
    import threading

    import app.integrations.document_storage as storage_module

    storage = LocalDocumentStorage(tmp_path)
    opened = threading.Event()
    release = threading.Event()
    original_open = storage_module.os.open

    def pause_after_exclusive_open(path, flags, *args, **kwargs):
        fd = original_open(path, flags, *args, **kwargs)
        if str(path).endswith(".pending") and flags & os.O_EXCL:
            opened.set()
            assert release.wait(10)
        return fd

    monkeypatch.setattr(storage_module.os, "open", pause_after_exclusive_open)
    task = asyncio.create_task(storage.stage(Upload(chunks(b"hello")), 100))
    ctx = multiprocessing.get_context("spawn")
    ready = ctx.Event()
    receiver, sender = ctx.Pipe(duplex=False)
    recovery = ctx.Process(target=_recover_in_another_process, args=(tmp_path, ready, sender))
    try:
        assert await asyncio.to_thread(opened.wait, 5)
        recovery.start()
        sender.close()
        assert await asyncio.to_thread(ready.wait, 5)
        # The active creator has not reached its file flock. Another process must
        # not classify that visible journal as abandoned and unlink its name.
        assert not await asyncio.to_thread(receiver.poll, 0.15)
        release.set()
        staged = await task
        assert await asyncio.to_thread(receiver.poll, 5)
        assert receiver.recv() == ("ok", 0)
        journal = tmp_path / ".staging" / (staged.stored.key.split("/")[-1] + ".pending")
        assert journal.is_file()
        with journal.open("r+b") as competing:
            with pytest.raises(BlockingIOError):
                fcntl.flock(competing.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        await storage.promote(staged)
        await storage.abandon(staged)

        async def unreferenced(key):
            return False

        assert await storage.recover(unreferenced) == 1
        assert not (tmp_path / staged.stored.key).exists()
        assert await storage.recover(unreferenced) == 0
    finally:
        release.set()
        if not task.done():
            await asyncio.gather(task, return_exceptions=True)
        if recovery.pid is not None:
            await asyncio.to_thread(recovery.join, 5)
            if recovery.is_alive():
                recovery.terminate()
                await asyncio.to_thread(recovery.join, 5)
            recovery.close()
        receiver.close()
        sender.close()
        storage.close()


async def test_same_storage_instance_publication_lock_uses_fresh_description(tmp_path, monkeypatch):
    import asyncio
    import os
    import threading

    import app.integrations.document_storage as storage_module

    storage = LocalDocumentStorage(tmp_path)
    opened = threading.Event()
    release = threading.Event()
    enumerating = threading.Event()
    original_open = storage_module.os.open
    original_leases = storage._leases

    def paused_open(path, flags, *args, **kwargs):
        fd = original_open(path, flags, *args, **kwargs)
        if str(path).endswith(".pending") and flags & os.O_EXCL:
            opened.set()
            assert release.wait(5)
        return fd

    def leases():
        enumerating.set()
        return original_leases()

    monkeypatch.setattr(storage_module.os, "open", paused_open)
    monkeypatch.setattr(storage, "_leases", leases)

    async def unreferenced(key):
        return False

    task = asyncio.create_task(storage.stage(Upload(chunks(b"hello")), 100))
    recovery = None
    try:
        assert await asyncio.to_thread(opened.wait, 5)
        recovery = asyncio.create_task(storage.recover(unreferenced))
        assert await asyncio.to_thread(enumerating.wait, 5)
        await asyncio.sleep(0.05)
        assert not recovery.done()
        release.set()
        staged = await task
        assert await recovery == 0
        await storage.promote(staged)
        await storage.abandon(staged)
        assert await storage.recover(unreferenced) == 1
        assert await storage.recover(unreferenced) == 0
    finally:
        release.set()
        await asyncio.gather(task, *([recovery] if recovery else []), return_exceptions=True)
        storage.close()
