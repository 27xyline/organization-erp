import { describe, expect, it } from 'vitest'
import { getDb } from '../prisma'

describe('Prisma AuditLog Immutability', () => {
  it('prevents update operations on AuditLog', async () => {
    const db = getDb()
    await expect(db.auditLog.update({
      where: { id: 'test-id' },
      data: { action: 'MODIFIED' }
    })).rejects.toThrow('AuditLog entries are immutable and cannot be updated.')
  })

  it('prevents delete operations on AuditLog', async () => {
    const db = getDb()
    await expect(db.auditLog.delete({
      where: { id: 'test-id' }
    })).rejects.toThrow('AuditLog entries are immutable and cannot be deleted.')
  })
})
