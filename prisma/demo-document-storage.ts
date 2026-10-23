import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, link, open, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'

type DemoDocumentWriteOptions = {
  root?: string
  /** Test hook for deterministic path-boundary checks; production seed uses a fresh UUID. */
  objectId?: string
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

async function assertRealDirectory(root: string, candidate: string): Promise<void> {
  const info = await lstat(candidate)
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error('Demo document storage path must contain only real directories')
  }
  const actual = await realpath(candidate)
  if (!isWithin(root, actual)) {
    throw new Error('Demo document storage path escaped its configured root')
  }
}

async function ensureShardDirectory(root: string, relativePath: string): Promise<string> {
  let current = root
  for (const segment of relativePath.split(path.sep)) {
    current = path.join(current, segment)
    try {
      await mkdir(current, { mode: 0o700 })
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw error
    }
    await assertRealDirectory(root, current)
  }
  return current
}

/** Fixture-only writer that preserves the UUID shard layout and exclusive promotion semantics. */
export async function writeDemoDocument(
  content: Buffer,
  options: DemoDocumentWriteOptions = {},
): Promise<{ storageKey: string; sizeBytes: bigint; sha256: string }> {
  const rootPath = path.resolve(options.root ?? process.env.DOCUMENT_STORAGE_ROOT ?? path.join(process.cwd(), '.runtime', 'documents'))
  const objectId = options.objectId ?? randomUUID()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(objectId)) {
    throw new Error('Demo document storage ID must be a UUID')
  }

  await mkdir(rootPath, { recursive: true, mode: 0o700 })
  await assertRealDirectory(await realpath(rootPath), rootPath)
  const root = await realpath(rootPath)
  const storageKey = `${objectId.slice(0, 2)}/${objectId.slice(2, 4)}/${objectId}`
  const [firstShard, secondShard] = storageKey.split('/').slice(0, 2)
  const directory = await ensureShardDirectory(root, path.join(firstShard, secondShard))
  const temporaryPath = path.join(directory, `.demo-${randomUUID()}.tmp`)
  const finalPath = path.join(directory, objectId)
  let temporaryExists = false

  try {
    const handle = await open(temporaryPath, 'wx', 0o600)
    temporaryExists = true
    try {
      await handle.writeFile(content)
      await handle.sync()
    } finally {
      await handle.close()
    }

    // link() is an atomic, same-filesystem exclusive promotion: it never replaces an existing key.
    await link(temporaryPath, finalPath)
    await unlink(temporaryPath)
    temporaryExists = false
    const directoryHandle = await open(directory, 'r')
    try {
      await directoryHandle.sync()
    } finally {
      await directoryHandle.close()
    }
  } catch (error) {
    if (temporaryExists) await unlink(temporaryPath).catch(() => undefined)
    throw error
  }

  return {
    storageKey,
    sizeBytes: BigInt(content.byteLength),
    sha256: createHash('sha256').update(content).digest('hex'),
  }
}
