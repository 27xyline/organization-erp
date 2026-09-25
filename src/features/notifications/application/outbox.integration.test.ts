import { PrismaClient, NotificationChannel, NotificationEventType, NotificationOutboxStatus } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { processNotificationOutbox } from './outbox.service'

const url = process.env.TEST_DATABASE_URL
const describeDb = url ? describe : describe.skip

describeDb('outbox PostgreSQL locking and recovery', () => {
  const db = new PrismaClient({ datasources: { db: { url: url ?? 'postgresql://unused:unused@127.0.0.1:1/unused' } } })
  let userId: string

  beforeAll(async () => {
    const user = await db.user.create({
      data: { username: `outbox-test-${Date.now()}@example.test`, name: 'Outbox test', passwordHash: 'test' },
    })
    userId = user.id
  })

  afterAll(async () => {
    if (userId) await db.user.delete({ where: { id: userId } })
    await db.$disconnect()
  })

  async function enqueue(status: NotificationOutboxStatus = NotificationOutboxStatus.PENDING, attempts = 0) {
    const notification = await db.notification.create({
      data: {
        userId,
        eventType: NotificationEventType.SYSTEM,
        channel: NotificationChannel.EMAIL,
        title: 'Test',
        body: 'Test',
        dedupeKey: `outbox-test-${crypto.randomUUID()}`,
      },
    })
    return db.notificationOutbox.create({
      data: {
        userId,
        notificationId: notification.id,
        status,
        attempts,
        claimToken: status === NotificationOutboxStatus.PROCESSING ? crypto.randomUUID() : null,
        leaseExpiresAt: status === NotificationOutboxStatus.PROCESSING
          ? new Date(Date.now() - 1000) : null,
        payload: { eventType: 'SYSTEM', title: 'Test', body: 'Test' },
      },
    })
  }

  it('two independent workers cannot send the same claimed mail', async () => {
    const mail = await enqueue()
    let release!: () => void
    const inFlight = new Promise<void>((resolve) => { release = resolve })
    let started!: () => void
    const enteredSend = new Promise<void>((resolve) => { started = resolve })
    const sender = { send: vi.fn(async () => { started(); await inFlight }) }

    const first = processNotificationOutbox(sender, db, 1)
    await enteredSend
    const second = await processNotificationOutbox(sender, db, 1)
    expect(second.sent).toBe(0)
    release()
    expect((await first).sent).toBe(1)
    expect(sender.send).toHaveBeenCalledTimes(1)
    expect((await db.notificationOutbox.findUniqueOrThrow({ where: { id: mail.id } })).attempts).toBe(1)
  })

  it('recovers an expired lease after a crashed worker', async () => {
    const mail = await enqueue(NotificationOutboxStatus.PROCESSING, 1)
    const sender = { send: vi.fn().mockResolvedValue(undefined) }
    expect((await processNotificationOutbox(sender, db, 1)).sent).toBe(1)
    expect(sender.send).toHaveBeenCalledTimes(1)
    const recovered = await db.notificationOutbox.findUniqueOrThrow({ where: { id: mail.id } })
    expect(recovered.status).toBe(NotificationOutboxStatus.SENT)
    expect(recovered.attempts).toBe(2)
  })

  it('marks a fifth abandoned attempt as terminal without sending again', async () => {
    const mail = await enqueue(NotificationOutboxStatus.PROCESSING, 5)
    const sender = { send: vi.fn() }
    await processNotificationOutbox(sender, db, 1)
    expect(sender.send).not.toHaveBeenCalled()
    expect((await db.notificationOutbox.findUniqueOrThrow({ where: { id: mail.id } })).status)
      .toBe(NotificationOutboxStatus.FAILED)
  })
})
