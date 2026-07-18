import type { Readable } from 'node:stream'

export interface StoredDocumentObject {
  storageKey: string
  sizeBytes: bigint
  sha256: string
}

export interface OpenedDocumentObject {
  stream: Readable
  sizeBytes: bigint
}

export interface StoragePort {
  healthCheck(): Promise<void>
  write(input: Readable, options: { maxSizeBytes: number }): Promise<StoredDocumentObject>
  open(
    storageKey: string,
    expected: { sizeBytes: bigint; sha256: string },
  ): Promise<OpenedDocumentObject>
  verify(
    storageKey: string,
    expected: { sizeBytes: bigint; sha256: string },
  ): Promise<boolean>
  delete(storageKey: string): Promise<void>
}
