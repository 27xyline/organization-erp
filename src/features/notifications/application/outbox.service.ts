import { NotificationOutboxStatus, type PrismaClient } from '@prisma/client'
import { getDb } from '@/lib/prisma'

export interface EmailNotificationSender {
  send(input: {
    userId: string
    eventType: string
    title: string
    body: string
    targetUrl?: string | null
  }): Promise<void>
}

export async function processNotificationOutbox(
  sender?: EmailNotificationSender,
  db: PrismaClient = getDb(),
  limit = 50,
) {
  const pending = await db.notificationOutbox.findMany({
    where: {
      status: NotificationOutboxStatus.PENDING,
      availableAt: { lte: new Date() },
    },
    orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
    take: Math.min(Math.max(limit, 1), 100),
  })

  if (!sender) {
    if (pending.length) {
      await db.notificationOutbox.updateMany({
        where: { id: { in: pending.map((item) => item.id) } },
        data: {
          status: NotificationOutboxStatus.SKIPPED,
          processedAt: new Date(),
          lastError: 'EMAIL_PROVIDER_DISABLED',
        },
      })
    }
    return { sent: 0, failed: 0, skipped: pending.length }
  }

  let sent = 0
  let failed = 0
  for (const item of pending) {
    const payload = item.payload as {
      eventType: string
      title: string
      body: string
      targetUrl?: string | null
    }
    try {
      await sender.send({ userId: item.userId, ...payload })
      await db.notificationOutbox.update({
        where: { id: item.id },
        data: {
          status: NotificationOutboxStatus.SENT,
          processedAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
        },
      })
      sent += 1
    } catch (error) {
      await db.notificationOutbox.update({
        where: { id: item.id },
        data: {
          status: NotificationOutboxStatus.FAILED,
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message.slice(0, 1000) : 'UNKNOWN_ERROR',
        },
      })
      failed += 1
    }
  }
  return { sent, failed, skipped: 0 }
}
