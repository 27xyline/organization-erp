import { describe, expect, it, vi } from 'vitest'
import { collectNotificationWorkerMetrics } from '../metrics'

describe('notification worker metrics', () => {
  it('reports backlog age, terminal failures and last successful generation without personal data', async () => {
    const now = new Date('2026-09-25T12:00:00.000Z')
    const db = {
      notificationOutbox: {
        count: vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(2),
        findFirst: vi.fn().mockResolvedValue({ createdAt: new Date('2026-09-25T11:50:00.000Z') }),
      },
      scheduledAlertRun: {
        findUnique: vi.fn().mockResolvedValue({ lastSucceededAt: new Date('2026-09-25T11:00:00.000Z') }),
      },
    } as any

    const snapshot = await collectNotificationWorkerMetrics(db, now)
    expect(snapshot).toEqual({
      pending: 7,
      oldestAgeSeconds: 600,
      terminalFailed: 2,
      lastSuccessTimestampSeconds: new Date('2026-09-25T11:00:00.000Z').getTime() / 1000,
    })
    expect(Object.keys(snapshot)).toEqual([
      'pending', 'oldestAgeSeconds', 'terminalFailed', 'lastSuccessTimestampSeconds',
    ])
    expect(db.notificationOutbox.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: { createdAt: true },
    }))
  })

  it('reports zero when the queue is empty and generation has not succeeded', async () => {
    const db = {
      notificationOutbox: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      scheduledAlertRun: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any

    expect(await collectNotificationWorkerMetrics(db)).toEqual({
      pending: 0, oldestAgeSeconds: 0, terminalFailed: 0, lastSuccessTimestampSeconds: 0,
    })
  })
})
