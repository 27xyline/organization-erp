import { NotificationEventType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { generateScheduledAlerts } from '../scheduled-alerts'

describe('generateScheduledAlerts', () => {
  it('runs pluggable generators and publishes their alerts', async () => {
    const publish = vi.fn()
      .mockResolvedValueOnce({ created: 1, emailQueued: 0 })
      .mockResolvedValueOnce({ created: 2, emailQueued: 1 })
    const result = await generateScheduledAlerts({
      now: new Date('2026-07-18T00:00:00Z'),
      actorId: 'admin-1',
      requestId: 'request-1',
      notifications: { publish } as never,
      generators: [{
        key: 'custom',
        collect: vi.fn(async () => [
          {
            recipientUserIds: ['user-1'],
            eventType: NotificationEventType.CONTRACT_EXPIRING,
            title: 'A',
            body: 'A',
            dedupeKey: 'a',
          },
          {
            recipientUserIds: ['user-2'],
            eventType: NotificationEventType.TASK_OVERDUE,
            title: 'B',
            body: 'B',
            dedupeKey: 'b',
          },
        ]),
      }],
    })
    expect(result).toEqual({
      generated: 3,
      emailQueued: 1,
      sources: { custom: 3 },
    })
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1',
      requestId: 'request-1',
    }))
  })
})
