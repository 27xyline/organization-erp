import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('notification migration', () => {
  const sql = readFileSync(join(
    process.cwd(),
    'prisma/migrations/20260718170000_add_notification_platform/migration.sql',
  ), 'utf8')

  it('enforces recipient dedupe and indexed inbox/outbox access', () => {
    expect(sql).toContain('"notifications_userId_dedupeKey_channel_key"')
    expect(sql).toContain('"notifications_userId_channel_deletedAt_readAt_createdAt_idx"')
    expect(sql).toContain('"notification_outbox_status_availableAt_createdAt_idx"')
    expect(sql).toContain('"notifications_read_at_in_app_only"')
    expect(sql).toContain('ON DELETE CASCADE')
  })
})
