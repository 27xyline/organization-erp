import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ReadOnlyDocumentStorage } from '../read-only-document-storage'

const roots: string[] = []

async function tempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'project1-document-reader-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('ReadOnlyDocumentStorage', () => {
  it('verifies copied file size and SHA without exposing write operations', async () => {
    const root = await tempRoot()
    const key = 'ab/cd/abcdefab-cdef-4abc-8def-abcdefabcdef'
    const file = path.join(root, key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, 'copied file')
    const storage = new ReadOnlyDocumentStorage({ root })
    const reference = { sizeBytes: BigInt(11), sha256: createHash('sha256').update('copied file').digest('hex') }

    await expect(storage.verify(key, reference)).resolves.toBe(true)
    await expect(storage.verify(key, { ...reference, sizeBytes: BigInt(12) })).resolves.toBe(false)
    expect('write' in storage).toBe(false)
  })

  it('rejects unsafe keys and does not follow an object symlink outside the root', async () => {
    const root = await tempRoot()
    const outside = await tempRoot()
    const key = 'ab/cd/abcdefab-cdef-4abc-8def-abcdefabcdef'
    const file = path.join(root, key)
    await mkdir(path.dirname(file), { recursive: true })
    const outsideFile = path.join(outside, 'secret')
    await writeFile(outsideFile, 'secret')
    await (await import('node:fs/promises')).symlink(outsideFile, file)
    const storage = new ReadOnlyDocumentStorage({ root })
    const reference = { sizeBytes: BigInt(6), sha256: createHash('sha256').update('secret').digest('hex') }

    await expect(storage.verify('../../secret', reference)).resolves.toBe(false)
    await expect(storage.verify(key, reference)).resolves.toBe(false)
  })
})
