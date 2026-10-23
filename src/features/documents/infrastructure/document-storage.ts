import type { DocumentStorageReader } from './read-only-document-storage'
import { ReadOnlyDocumentStorage } from './read-only-document-storage'

let storage: DocumentStorageReader | undefined

/** Read-only adapter retained for readiness and explicit data-integrity checks. */
export function getDocumentStorage(): DocumentStorageReader {
  storage ??= new ReadOnlyDocumentStorage()
  return storage
}

export function setDocumentStorageForTests(value: DocumentStorageReader | undefined): void {
  storage = value
}
