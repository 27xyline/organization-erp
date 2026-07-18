import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('document migration', () => {
  it('defines FK indexes, integrity checks and immutable versions', async () => {
    const sql = await readFile(path.join(
      process.cwd(),
      'prisma/migrations/20260718141000_add_local_document_management/migration.sql',
    ), 'utf8')

    for (const index of [
      'documents_projectId_idx',
      'documents_employeeId_idx',
      'documents_assetId_idx',
      'documents_createdById_idx',
      'document_versions_uploadedById_idx',
      'document_versions_documentId_versionNumber_key',
    ]) {
      expect(sql).toContain(`"${index}"`)
    }
    expect(sql).toContain('documents_archive_consistent')
    expect(sql).toContain('document_versions_sha256_valid')
    expect(sql).toContain('document_versions_immutable')
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED')
  })
})

