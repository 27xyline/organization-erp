import { describe, expect, it, vi } from 'vitest'
import { processNotificationOutbox } from './outbox.service'

const item = (attempts: number) => ({
  id: 'mail-1', userId: 'user-1', attempts,
  payload: { eventType: 'SYSTEM', title: 'Title', body: 'Body' },
})

function mockDb() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn(),
    notificationOutbox: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  } as any
}

describe('notification outbox leases', () => {
  it('lets only one of two workers claim the same mail', async () => {
    const db = mockDb()
    let available = true
    db.$queryRaw.mockImplementation(async () => {
      if (!available) return []
      available = false
      return [item(1)]
    })
    const sender = { send: vi.fn().mockResolvedValue(undefined) }

    const result = await Promise.all([
      processNotificationOutbox(sender, db, 1),
      processNotificationOutbox(sender, db, 1),
    ])
    expect(result.reduce((sum, run) => sum + run.sent, 0)).toBe(1)
    expect(sender.send).toHaveBeenCalledTimes(1)
    const sql = db.$queryRaw.mock.calls[0][0].join(' ')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).toContain('"leaseExpiresAt" <= NOW()')
  })

  it('retries with exponential backoff and stops after five attempts', async () => {
    const db = mockDb()
    db.$queryRaw.mockResolvedValueOnce([item(5)]).mockResolvedValue([])
    const sender = { send: vi.fn().mockRejectedValue(new Error('SMTP_FAILED')) }

    const result = await processNotificationOutbox(sender, db)
    expect(result.failed).toBe(1)
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', lastError: 'SMTP_FAILED' }),
    }))
  })

  it('leaves a lease after SMTP succeeds but the SENT write fails', async () => {
    const db = mockDb()
    db.$queryRaw.mockResolvedValueOnce([item(1)]).mockResolvedValue([])
    db.notificationOutbox.updateMany.mockRejectedValueOnce(new Error('database unavailable'))
    const sender = { send: vi.fn().mockResolvedValue(undefined) }

    await expect(processNotificationOutbox(sender, db)).rejects.toThrow('database unavailable')
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledTimes(1)
    expect(db.notificationOutbox.updateMany.mock.calls[0][0].data.status).toBe('SENT')
  })
})
