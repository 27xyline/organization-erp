import type { StoragePort } from './storage.port'
import { LocalFilesystemStorage } from './local-filesystem-storage'

let storage: StoragePort | undefined

export function getDocumentStorage(): StoragePort {
  storage ??= new LocalFilesystemStorage()
  return storage
}

export function setDocumentStorageForTests(value: StoragePort | undefined): void {
  storage = value
}
