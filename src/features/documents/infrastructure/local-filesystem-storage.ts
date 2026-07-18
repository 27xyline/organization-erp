import { createHash, randomUUID } from 'node:crypto'
import {
  constants,
  createReadStream,
  createWriteStream,
  type ReadStream,
} from 'node:fs'
import {
  access,
  chmod,
  mkdir,
  open as openFile,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises'
import path from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type {
  OpenedDocumentObject,
  StoragePort,
  StoredDocumentObject,
} from './storage.port'

const STORAGE_KEY_PATTERN = /^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f-]{36}$/

export class LocalStorageError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_STORAGE_ROOT'
      | 'INVALID_STORAGE_KEY'
      | 'FILE_TOO_LARGE'
      | 'EMPTY_FILE'
      | 'OBJECT_NOT_FOUND'
      | 'OBJECT_CORRUPTED',
    message?: string,
  ) {
    super(message || code)
    this.name = 'LocalStorageError'
  }
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
    || isWithin(path.join(projectRoot, 'public'), storageRoot)
    || isWithin(path.join(projectRoot, 'src'), storageRoot)
    || isWithin(path.join(projectRoot, '.next'), storageRoot)
    || isWithin(path.join(projectRoot, '.next-dev'), storageRoot)
    || isWithin(path.join(projectRoot, 'node_modules'), storageRoot)
  ) {
    throw new LocalStorageError(
      'INVALID_STORAGE_ROOT',
      'Хранилище документов не может находиться в публичном каталоге или каталоге сборки',
    )
  }
}

function integrityTransform(expected?: { sizeBytes: bigint; sha256: string }) {
  const hash = createHash('sha256')
  let sizeBytes = BigInt(0)

  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sizeBytes += BigInt(chunk.length)
      hash.update(chunk)
      callback(null, chunk)
    },
    flush(callback) {
      const sha256 = hash.digest('hex')
      if (
        expected
        && (expected.sizeBytes !== sizeBytes || expected.sha256 !== sha256)
      ) {
        callback(new LocalStorageError('OBJECT_CORRUPTED', 'Файл повреждён или изменён'))
        return
      }
      callback()
    },
  })

  return stream
}

export class LocalFilesystemStorage implements StoragePort {
  readonly root: string
  private readonly projectRoot: string
  private initializedRoot?: Promise<string>

  constructor(options: { root?: string; projectRoot?: string } = {}) {
    this.projectRoot = path.resolve(
      options.projectRoot ?? /*turbopackIgnore: true*/ process.cwd(),
    )
    this.root = path.resolve(
      options.root
        ?? process.env.DOCUMENT_STORAGE_ROOT
        ?? path.join(this.projectRoot, '.runtime', 'documents'),
    )
    assertSafeStorageRoot(this.root, this.projectRoot)
  }

  private async ensureRoot(): Promise<string> {
    this.initializedRoot ??= (async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 })
      await chmod(this.root, 0o700)
      return realpath(this.root)
    })()
    return this.initializedRoot
  }

  private validateKey(storageKey: string): void {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new LocalStorageError('INVALID_STORAGE_KEY', 'Некорректный ключ хранения')
    }
  }

  private async resolveExistingObject(storageKey: string): Promise<string> {
    this.validateKey(storageKey)
    const root = await this.ensureRoot()
    const candidate = path.resolve(root, ...storageKey.split('/'))
    if (!isWithin(root, candidate)) {
      throw new LocalStorageError('INVALID_STORAGE_KEY', 'Некорректный ключ хранения')
    }

    try {
      const resolved = await realpath(candidate)
      if (!isWithin(root, resolved)) {
        throw new LocalStorageError('INVALID_STORAGE_KEY', 'Объект находится вне хранилища')
      }
      const metadata = await stat(resolved)
      if (!metadata.isFile()) {
        throw new LocalStorageError('OBJECT_NOT_FOUND', 'Файл не найден')
      }
      return resolved
    } catch (error) {
      if (error instanceof LocalStorageError) throw error
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new LocalStorageError('OBJECT_NOT_FOUND', 'Файл не найден')
      }
      throw error
    }
  }

  async write(input: Readable, options: { maxSizeBytes: number }): Promise<StoredDocumentObject> {
    if (!Number.isSafeInteger(options.maxSizeBytes) || options.maxSizeBytes <= 0) {
      throw new Error('maxSizeBytes must be a positive safe integer')
    }

    const root = await this.ensureRoot()
    const id = randomUUID()
    const storageKey = `${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`
    const finalPath = path.resolve(root, ...storageKey.split('/'))
    const parent = path.dirname(finalPath)
    await mkdir(parent, { recursive: true, mode: 0o700 })
    await chmod(parent, 0o700)

    const resolvedParent = await realpath(parent)
    if (!isWithin(root, resolvedParent)) {
      throw new LocalStorageError('INVALID_STORAGE_KEY', 'Каталог хранения находится вне корня')
    }

    const tempPath = path.join(resolvedParent, `.${randomUUID()}.tmp`)
    const hash = createHash('sha256')
    let sizeBytes = BigInt(0)
    let committed = false

    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += BigInt(chunk.length)
        if (sizeBytes > BigInt(options.maxSizeBytes)) {
          callback(new LocalStorageError('FILE_TOO_LARGE', 'Превышен допустимый размер файла'))
          return
        }
        hash.update(chunk)
        callback(null, chunk)
      },
    })

    try {
      await pipeline(
        input,
        meter,
        createWriteStream(tempPath, { flags: 'wx', mode: 0o600 }),
      )
      if (sizeBytes === BigInt(0)) {
        throw new LocalStorageError('EMPTY_FILE', 'Файл пуст')
      }

      const handle = await openFile(tempPath, constants.O_RDONLY)
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }

      try {
        await access(finalPath, constants.F_OK)
        throw new Error('Generated storage key already exists')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }

      await rename(tempPath, finalPath)
      committed = true
      return { storageKey, sizeBytes, sha256: hash.digest('hex') }
    } finally {
      if (!committed) {
        await unlink(tempPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error
        })
      }
    }
  }

  async healthCheck(): Promise<void> {
    const root = await this.ensureRoot()
    await access(root, constants.R_OK | constants.W_OK)
  }

  async open(
    storageKey: string,
    expected: { sizeBytes: bigint; sha256: string },
  ): Promise<OpenedDocumentObject> {
    const objectPath = await this.resolveExistingObject(storageKey)
    const metadata = await stat(objectPath)
    if (BigInt(metadata.size) !== expected.sizeBytes) {
      throw new LocalStorageError('OBJECT_CORRUPTED', 'Размер файла не совпадает с метаданными')
    }

    const source = createReadStream(objectPath, { flags: 'r' }) as ReadStream
    const verifier = integrityTransform(expected)
    source.on('error', (error) => verifier.destroy(error))
    return {
      stream: source.pipe(verifier),
      sizeBytes: BigInt(metadata.size),
    }
  }

  async verify(
    storageKey: string,
    expected: { sizeBytes: bigint; sha256: string },
  ): Promise<boolean> {
    try {
      const objectPath = await this.resolveExistingObject(storageKey)
      const metadata = await stat(objectPath)
      if (BigInt(metadata.size) !== expected.sizeBytes) return false

      const hash = createHash('sha256')
      let sizeBytes = BigInt(0)
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          sizeBytes += BigInt(chunk.length)
          hash.update(chunk)
          callback()
        },
      })
      await pipeline(createReadStream(objectPath), meter)
      return sizeBytes === expected.sizeBytes && hash.digest('hex') === expected.sha256
    } catch (error) {
      if (
        error instanceof LocalStorageError
        && ['OBJECT_NOT_FOUND', 'OBJECT_CORRUPTED'].includes(error.code)
      ) {
        return false
      }
      throw error
    }
  }

  async delete(storageKey: string): Promise<void> {
    this.validateKey(storageKey)
    const root = await this.ensureRoot()
    const candidate = path.resolve(root, ...storageKey.split('/'))
    if (!isWithin(root, candidate)) {
      throw new LocalStorageError('INVALID_STORAGE_KEY', 'Некорректный ключ хранения')
    }

    try {
      const resolved = await realpath(candidate)
      if (!isWithin(root, resolved)) {
        throw new LocalStorageError('INVALID_STORAGE_KEY', 'Объект находится вне хранилища')
      }
      await unlink(resolved)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }

    let directory = path.dirname(candidate)
    while (directory !== root && isWithin(root, directory)) {
      try {
        await rmdir(directory)
      } catch (error) {
        if (['ENOTEMPTY', 'ENOENT'].includes((error as NodeJS.ErrnoException).code || '')) break
        throw error
      }
      directory = path.dirname(directory)
    }
  }
}
