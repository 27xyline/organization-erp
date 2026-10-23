import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'

import { writeDemoDocument } from './demo-document-storage'

const roots: string[] = []
const validId = '123e4567-e89b-42d3-a456-426614174000'

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'stage08-seed-storage-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('demo document storage containment', () => {
  it('writes complete content using private UUID shards and reports its digest', async () => {
    const root = await temporaryRoot()
    const content = Buffer.from('stage08 synthetic demo fixture')

    const stored = await writeDemoDocument(content, { root, objectId: validId })

    expect(stored).toEqual({
      storageKey: '12/3e/123e4567-e89b-42d3-a456-426614174000',
      sizeBytes: BigInt(content.byteLength),
      sha256: createHash('sha256').update(content).digest('hex'),
    })
    expect(await readFile(path.join(root, ...stored.storageKey.split('/')))).toEqual(content)
  })

  it('rejects a symlinked shard and leaves the external target untouched', async () => {
    const root = await temporaryRoot()
    const outside = await temporaryRoot()
    await mkdir(path.join(root, '12'))
    await symlink(outside, path.join(root, '12', '3e'))

    await expect(writeDemoDocument(Buffer.from('synthetic'), { root, objectId: validId }))
      .rejects.toThrow(/real directories|escaped/)
    expect(await readdir(outside)).toEqual([])
  })

  it('uses exclusive promotion and does not overwrite or leave a temp file on collision', async () => {
    const root = await temporaryRoot()
    const storageKey = '12/3e/123e4567-e89b-42d3-a456-426614174000'
    const finalPath = path.join(root, ...storageKey.split('/'))
    await mkdir(path.dirname(finalPath), { recursive: true })
    await writeFile(finalPath, 'original')

    await expect(writeDemoDocument(Buffer.from('replacement'), { root, objectId: validId })).rejects.toThrow()
    expect(await readFile(finalPath, 'utf8')).toBe('original')
    expect((await readdir(path.dirname(finalPath))).sort()).toEqual([validId])
  })

  it('rejects non-UUID object IDs before creating any shard', async () => {
    const root = await temporaryRoot()
    await expect(writeDemoDocument(Buffer.from('synthetic'), { root, objectId: '../outside' })).rejects.toThrow(/UUID/)
    expect(await readdir(root)).toEqual([])
  })
})
