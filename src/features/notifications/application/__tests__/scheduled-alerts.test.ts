import { NotificationEventType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { createScheduledAlertGenerators, generateScheduledAlerts } from '../scheduled-alerts'

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

describe('approval reminders', () => {
  const now = new Date('2026-07-18T00:00:00Z')
  const step = {
    id: 'step-1',
    approverId: 'approver-1',
    requestId: 'approval-1',
    dueDate: new Date('2026-07-19T00:00:00Z'),
    request: { id: 'approval-1', title: 'Заявка' },
  }

  function setup() {
    const findMany = vi.fn().mockResolvedValue([step])
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const generators = createScheduledAlertGenerators({
      approvalStep: { findMany, updateMany },
    } as never).filter((generator) => generator.key === 'approval-reminders')
    return { findMany, updateMany, generators }
  }

  it('marks the step only after publishing the unique notification', async () => {
    const { updateMany, generators } = setup()
    const publish = vi.fn().mockResolvedValue({ created: 1, emailQueued: 0 })

    await generateScheduledAlerts({ now, generators, notifications: { publish } as never })

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: 'approval-reminder:step-1',
      recipientUserIds: ['approver-1'],
    }))
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'step-1', status: 'PENDING', reminderSent: false },
      data: { reminderSent: true },
    })
    expect(publish.mock.invocationCallOrder[0]).toBeLessThan(updateMany.mock.invocationCallOrder[0])
  })

  it('keeps the step pending on publication failure so a later run retries it', async () => {
    const { updateMany, generators } = setup()
    const publish = vi.fn().mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({ created: 1, emailQueued: 0 })

    await expect(generateScheduledAlerts({ now, generators, notifications: { publish } as never }))
      .rejects.toThrow('database unavailable')
    expect(updateMany).not.toHaveBeenCalled()

    await generateScheduledAlerts({ now, generators, notifications: { publish } as never })
    expect(updateMany).toHaveBeenCalledTimes(1)
  })

  it('records each successful reminder separately if a later reminder fails', async () => {
    const { findMany, updateMany, generators } = setup()
    findMany.mockResolvedValue([
      step,
      { ...step, id: 'step-2', approverId: 'approver-2' },
    ])
    const publish = vi.fn().mockResolvedValueOnce({ created: 1, emailQueued: 0 })
      .mockRejectedValueOnce(new Error('publication failed'))

    await expect(generateScheduledAlerts({ now, generators, notifications: { publish } as never }))
      .rejects.toThrow('publication failed')

    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'step-1', status: 'PENDING', reminderSent: false },
      data: { reminderSent: true },
    })
  })

  it('marks a previously published reminder after recovery without creating a duplicate', async () => {
    const { updateMany, generators } = setup()
    const publish = vi.fn().mockResolvedValue({ created: 0, emailQueued: 0 })

    await generateScheduledAlerts({ now, generators, notifications: { publish } as never })

    expect(updateMany).toHaveBeenCalledTimes(1)
  })
})
