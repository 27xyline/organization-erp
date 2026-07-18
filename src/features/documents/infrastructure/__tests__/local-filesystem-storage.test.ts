import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LocalFilesystemStorage,
  LocalStorageError,
} from '../local-filesystem-storage'

const roots: string[] = []

async function tempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'project1-docs-'))
  roots.push(root)
  return root
}

async function filesBelow(directory: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await filesBelow(target))
    else result.push(target)
  }
  return result
}

async function streamText(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('LocalFilesystemStorage', () => {
  it('atomically writes, hashes, verifies, streams and deletes an opaque object', async () => {
    const root = await tempRoot()
    const storage = new LocalFilesystemStorage({ root, projectRoot: path.dirname(root) })
    const content = 'версия документа'
    const stored = await storage.write(Readable.from(Buffer.from(content)), { maxSizeBytes: 1024 })

    expect(stored.storageKey).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f-]{36}$/)
    expect(stored.sha256).toBe(createHash('sha256').update(content).digest('hex'))
    expect(await storage.verify(stored.storageKey, stored)).toBe(true)
    const opened = await storage.open(stored.storageKey, stored)
    expect(await streamText(opened.stream)).toBe(content)
    expect((await filesBelow(root)).some((file) => file.endsWith('.tmp'))).toBe(false)

    await storage.delete(stored.storageKey)
    expect(await filesBelow(root)).toEqual([])
  })

  it('rejects traversal keys before touching the filesystem', async () => {
    const root = await tempRoot()
    const storage = new LocalFilesystemStorage({ root, projectRoot: path.dirname(root) })
    await expect(storage.open('../../secret', {
      sizeBytes: BigInt(1),
      sha256: '0'.repeat(64),
    })).rejects.toMatchObject({ code: 'INVALID_STORAGE_KEY' })
    await expect(storage.delete('/etc/passwd')).rejects.toBeInstanceOf(LocalStorageError)
  })

  it('removes temporary data when the streamed size exceeds the limit', async () => {
    const root = await tempRoot()
    const storage = new LocalFilesystemStorage({ root, projectRoot: path.dirname(root) })
    await expect(
      storage.write(Readable.from(Buffer.alloc(32)), { maxSizeBytes: 8 }),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
    expect(await filesBelow(root)).toEqual([])
  })

  it('detects bytes changed outside the application', async () => {
    const root = await tempRoot()
    const storage = new LocalFilesystemStorage({ root, projectRoot: path.dirname(root) })
    const stored = await storage.write(Readable.from('original'), { maxSizeBytes: 1024 })
    await writeFile(path.join(root, stored.storageKey), 'tampered')
    expect(await storage.verify(stored.storageKey, stored)).toBe(false)
    expect(await readFile(path.join(root, stored.storageKey), 'utf8')).toBe('tampered')
  })
})

