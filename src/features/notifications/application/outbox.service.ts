import { randomUUID } from 'node:crypto'
import { NotificationOutboxStatus, type PrismaClient } from '@prisma/client'
import { getDb } from '@/lib/prisma'

const MAX_ATTEMPTS = 5
const LEASE_MINUTES = 5

type ClaimedOutbox = {
  id: string
  userId: string
  payload: {
    eventType: string
    title: string
    body: string
    targetUrl?: string | null
  }
  attempts: number
}

export interface EmailNotificationSender {
  send(input: {
    userId: string
    eventType: string
    title: string
    body: string
    targetUrl?: string | null
  }): Promise<void>
}

/** A claim is committed before SMTP starts, so another worker cannot select it. */
async function claimNext(db: PrismaClient, claimToken: string) {
  const rows = await db.$queryRaw<ClaimedOutbox[]>`
    WITH candidate AS (
      SELECT "id"
      FROM "notification_outbox"
      WHERE "attempts" < ${MAX_ATTEMPTS}
        AND "availableAt" <= NOW()
        AND (
          "status" IN ('PENDING'::"notification_outbox_status", 'FAILED'::"notification_outbox_status")
          OR (
            "status" = 'PROCESSING'::"notification_outbox_status"
            AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= NOW())
          )
        )
      ORDER BY "availableAt", "id"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "notification_outbox" AS outbox
    SET "status" = 'PROCESSING'::"notification_outbox_status",
        "attempts" = outbox."attempts" + 1,
        "claimToken" = ${claimToken},
        "leaseExpiresAt" = NOW() + (${LEASE_MINUTES} * INTERVAL '1 minute'),
        "updatedAt" = NOW()
    FROM candidate
    WHERE outbox."id" = candidate."id"
    RETURNING outbox."id", outbox."userId", outbox."payload", outbox."attempts"
  `
  return rows[0]
}

export async function processNotificationOutbox(
  sender: EmailNotificationSender,
  db: PrismaClient = getDb(),
  limit = 50,
) {
  // A worker that died during its fifth attempt leaves a leased row behind.
  // Make that row terminal once its lease expires.
  await db.$executeRaw`
    UPDATE "notification_outbox"
    SET "status" = 'FAILED'::"notification_outbox_status",
        "claimToken" = NULL,
        "leaseExpiresAt" = NULL,
        "processedAt" = NOW(),
        "lastError" = 'LEASE_EXPIRED_AFTER_MAX_ATTEMPTS',
        "updatedAt" = NOW()
    WHERE "status" = 'PROCESSING'::"notification_outbox_status"
      AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= NOW())
      AND "attempts" >= ${MAX_ATTEMPTS}
  `

  let sent = 0
  let failed = 0
  for (let count = 0; count < Math.min(Math.max(limit, 1), 100); count += 1) {
    const claimToken = randomUUID()
    const item = await claimNext(db, claimToken)
    if (!item) break

    try {
      await sender.send({ userId: item.userId, ...item.payload })
    } catch (error) {
      const terminal = item.attempts >= MAX_ATTEMPTS
      const availableAt = new Date(Date.now() + 2 ** item.attempts * 60_000)
      const result = await db.notificationOutbox.updateMany({
        where: { id: item.id, status: NotificationOutboxStatus.PROCESSING, claimToken },
        data: {
          status: terminal ? NotificationOutboxStatus.FAILED : NotificationOutboxStatus.PENDING,
          availableAt,
          processedAt: terminal ? new Date() : null,
          claimToken: null,
          leaseExpiresAt: null,
          lastError: error instanceof Error ? error.message.slice(0, 1000) : 'UNKNOWN_ERROR',
        },
      })
      failed += result.count
      continue
    }

    // A database failure here leaves the claim leased. Retrying after lease expiry
    // may duplicate a message already accepted by SMTP (at-least-once delivery).
    const result = await db.notificationOutbox.updateMany({
      where: { id: item.id, status: NotificationOutboxStatus.PROCESSING, claimToken },
      data: {
        status: NotificationOutboxStatus.SENT,
        processedAt: new Date(),
        claimToken: null,
        leaseExpiresAt: null,
        lastError: null,
      },
    })
    sent += result.count
  }
  return { sent, failed, skipped: 0 }
}
