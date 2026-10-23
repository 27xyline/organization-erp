import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { access, chmod, mkdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

const STORAGE_KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f-]{36}$/

export interface DocumentStorageReader {
  healthCheck(): Promise<void>
  verify(storageKey: string, expected: { sizeBytes: bigint; sha256: string }): Promise<boolean>
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function assertSafeStorageRoot(storageRoot: string, projectRoot: string): void {
  const unsafeRoots = [
    projectRoot,
    path.join(projectRoot, 'public'),
    path.join(projectRoot, 'src'),
    path.join(projectRoot, '.next'),
    path.join(projectRoot, '.next-dev'),
    path.join(projectRoot, 'node_modules'),
  ]
  if (
    unsafeRoots.some((unsafeRoot) => storageRoot === unsafeRoot)
    || ['public', 'src', '.next', '.next-dev', 'node_modules'].some((name) =>
      isWithin(path.join(projectRoot, name), storageRoot))
  ) {
    throw new Error('Хранилище документов не может находиться в публичном каталоге или каталоге сборки')
  }
}

export class ReadOnlyDocumentStorage implements DocumentStorageReader {
  readonly root: string
  private initializedRoot?: Promise<string>

  constructor(options: { root?: string; projectRoot?: string } = {}) {
    const projectRoot = path.resolve(options.projectRoot ?? process.cwd())
    this.root = path.resolve(
      options.root
        ?? process.env.DOCUMENT_STORAGE_ROOT
        ?? path.join(projectRoot, '.runtime', 'documents'),
    )
    assertSafeStorageRoot(this.root, projectRoot)
  }

  private ensureRoot(): Promise<string> {
    this.initializedRoot ??= (async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 })
      await chmod(this.root, 0o700)
      return realpath(this.root)
    })()
    return this.initializedRoot
  }

  async healthCheck(): Promise<void> {
    const root = await this.ensureRoot()
    await access(root, constants.R_OK | constants.W_OK)
  }

  async verify(storageKey: string, expected: { sizeBytes: bigint; sha256: string }): Promise<boolean> {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) return false
    try {
      const root = await this.ensureRoot()
      const candidate = path.resolve(root, ...storageKey.split('/'))
      if (!isWithin(root, candidate)) return false
      const resolved = await realpath(candidate)
      if (!isWithin(root, resolved)) return false
      const metadata = await stat(resolved)
      if (!metadata.isFile() || BigInt(metadata.size) !== expected.sizeBytes) return false

      const hash = createHash('sha256')
      for await (const chunk of createReadStream(resolved)) hash.update(chunk)
      return hash.digest('hex') === expected.sha256
    } catch {
      return false
    }
  }
}
