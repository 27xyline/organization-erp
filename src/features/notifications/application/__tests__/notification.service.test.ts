import { NotificationChannel, NotificationEventType } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  NotificationService,
  NotificationServiceError,
} from '../notification.service'

function mockDb() {
  const tx = {
    user: { findMany: vi.fn() },
    notificationPreference: { findMany: vi.fn(), upsert: vi.fn() },
    notification: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    notificationOutbox: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  const db = {
    notification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    notificationPreference: { findMany: vi.fn() },
    $transaction: vi.fn(async (input: unknown) => {
      if (typeof input === 'function') return input(tx)
      return Promise.all(input as Promise<unknown>[])
    }),
  }
  return { db, tx }
}

describe('NotificationService', () => {
  it('always scopes inbox reads and mutations to the authenticated user', async () => {
    const { db } = mockDb()
    db.notification.findMany.mockResolvedValue([])
    db.notification.count.mockResolvedValue(0)
    db.notification.updateMany.mockResolvedValue({ count: 0 })
    const service = new NotificationService(db as never)

    await service.list('user-a', { page: 1, pageSize: 20, unreadOnly: true })
    expect(db.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-a',
        channel: NotificationChannel.IN_APP,
        deletedAt: null,
        readAt: null,
      }),
    }))
    await expect(service.setRead('user-a', 'notification-b', true))
      .rejects.toBeInstanceOf(NotificationServiceError)
    expect(db.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'notification-b', userId: 'user-a' }),
    }))
  })

  it('deduplicates recipients, honors channel preferences and queues email idempotently', async () => {
    const { db, tx } = mockDb()
    tx.user.findMany.mockResolvedValue([{ id: 'user-a' }, { id: 'user-b' }])
    tx.notificationPreference.findMany.mockResolvedValue([
      { userId: 'user-a', channel: NotificationChannel.EMAIL, enabled: true },
      { userId: 'user-b', channel: NotificationChannel.IN_APP, enabled: false },
    ])
    tx.notification.createMany.mockResolvedValue({ count: 2 })
    tx.notification.findMany.mockResolvedValue([{
      id: 'email-a',
      userId: 'user-a',
      eventType: NotificationEventType.TASK_OVERDUE,
      title: 'Задача просрочена',
      body: 'Подготовить отчёт',
      targetUrl: '/projects/p1',
    }])
    tx.notificationOutbox.createMany.mockResolvedValue({ count: 1 })
    const service = new NotificationService(db as never)

    const result = await service.publish({
      recipientUserIds: ['user-b', 'user-a', 'user-a'],
      eventType: NotificationEventType.TASK_OVERDUE,
      title: 'Задача просрочена',
      body: 'Подготовить отчёт',
      dedupeKey: 'task:t1:overdue:2026-07-18',
    })

    expect(result).toEqual({ created: 2, emailQueued: 1 })
    expect(tx.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'user-a', channel: NotificationChannel.IN_APP }),
        expect.objectContaining({ userId: 'user-a', channel: NotificationChannel.EMAIL }),
      ]),
    }))
    expect(tx.notificationOutbox.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
    }))
    expect(tx.auditLog.create).toHaveBeenCalledOnce()
  })

  it('defaults to in-app enabled and email disabled', async () => {
    const { db } = mockDb()
    db.notificationPreference.findMany.mockResolvedValue([])
    const service = new NotificationService(db as never)
    const preferences = await service.getPreferences('user-a')
    expect(preferences).toContainEqual({
      eventType: NotificationEventType.SYSTEM,
      channel: NotificationChannel.IN_APP,
      enabled: true,
    })
    expect(preferences).toContainEqual({
      eventType: NotificationEventType.SYSTEM,
      channel: NotificationChannel.EMAIL,
      enabled: false,
    })
  })
})
