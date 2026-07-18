import { Readable } from 'node:stream'
import { DocumentStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  canTransitionDocumentStatus,
  DocumentService,
} from '../document.service'

function storageMock() {
  return {
    healthCheck: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue({
      storageKey: 'ab/cd/123e4567-e89b-12d3-a456-426614174000',
      sizeBytes: BigInt(4),
      sha256: 'a'.repeat(64),
    }),
    open: vi.fn(),
    verify: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  }
}

const metadata = {
  title: 'Договор',
  category: 'CONTRACT' as const,
  filename: 'contract.pdf',
}

describe('DocumentService', () => {
  it('removes a stored object when the database transaction fails', async () => {
    const storage = storageMock()
    const db = {
      project: { findUnique: vi.fn() },
      employee: { findUnique: vi.fn() },
      asset: { findUnique: vi.fn() },
      $transaction: vi.fn().mockRejectedValue(new Error('database unavailable')),
    }
    const service = new DocumentService(db as never, storage)

    await expect(service.create(metadata, {
      stream: Readable.from('data'),
      filename: metadata.filename,
      mimeType: 'application/pdf',
      declaredSizeBytes: 4,
    }, { id: 'admin-1', role: 'ADMIN' })).rejects.toThrow('database unavailable')

    expect(storage.delete).toHaveBeenCalledWith(
      'ab/cd/123e4567-e89b-12d3-a456-426614174000',
    )
  })

  it('denies legacy viewers before any file is written', async () => {
    const storage = storageMock()
    const service = new DocumentService({} as never, storage)
    await expect(service.create(metadata, {
      stream: Readable.from('data'),
      filename: metadata.filename,
      mimeType: 'application/pdf',
      declaredSizeBytes: 4,
    }, { id: 'viewer-1', role: 'VIEWER' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(storage.write).not.toHaveBeenCalled()
  })

  it('rejects a stale version before writing bytes', async () => {
    const storage = storageMock()
    const db = {
      document: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'document-1',
          status: DocumentStatus.DRAFT,
          lockVersion: 2,
        }),
      },
    }
    const service = new DocumentService(db as never, storage)
    await expect(service.addVersion('document-1', {
      filename: 'next.pdf',
      lockVersion: 1,
    }, {
      stream: Readable.from('data'),
      filename: 'next.pdf',
      mimeType: 'application/pdf',
      declaredSizeBytes: 4,
    }, { id: 'editor-1', role: 'EDITOR' })).rejects.toMatchObject({
      code: 'OPTIMISTIC_LOCK_CONFLICT',
    })
    expect(storage.write).not.toHaveBeenCalled()
  })

  it('enforces the lifecycle transition table', () => {
    expect(canTransitionDocumentStatus(DocumentStatus.DRAFT, DocumentStatus.IN_REVIEW)).toBe(true)
    expect(canTransitionDocumentStatus(DocumentStatus.DRAFT, DocumentStatus.SIGNED)).toBe(false)
    expect(canTransitionDocumentStatus(DocumentStatus.SIGNED, DocumentStatus.APPROVED)).toBe(false)
    expect(canTransitionDocumentStatus(DocumentStatus.ARCHIVED, DocumentStatus.DRAFT)).toBe(false)
  })
})
