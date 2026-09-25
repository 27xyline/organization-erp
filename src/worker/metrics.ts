import { metrics } from '@opentelemetry/api'
import { NotificationOutboxStatus, type Prisma, type PrismaClient } from '@prisma/client'
import { getDb } from '@/lib/prisma'

let registered = false
let lastHeartbeatSeconds = 0

export async function collectNotificationWorkerMetrics(db: PrismaClient, now = new Date()) {
  const waiting: Prisma.NotificationOutboxWhereInput = {
    OR: [
      { status: NotificationOutboxStatus.PENDING },
      { status: NotificationOutboxStatus.FAILED, attempts: { lt: 5 } },
      { status: NotificationOutboxStatus.PROCESSING, leaseExpiresAt: { lte: now } },
      { status: NotificationOutboxStatus.PROCESSING, leaseExpiresAt: null },
    ],
  }
  const [pending, oldest, terminalFailed, generation] = await Promise.all([
    db.notificationOutbox.count({ where: waiting }),
    db.notificationOutbox.findFirst({ where: waiting, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    db.notificationOutbox.count({
      where: { status: NotificationOutboxStatus.FAILED, attempts: { gte: 5 } },
    }),
    db.scheduledAlertRun.findUnique({
      where: { key: 'scheduled-alerts' }, select: { lastSucceededAt: true },
    }),
  ])

  return {
    pending,
    oldestAgeSeconds: oldest ? Math.max(0, (now.getTime() - oldest.createdAt.getTime()) / 1000) : 0,
    terminalFailed,
    lastSuccessTimestampSeconds: generation?.lastSucceededAt
      ? generation.lastSucceededAt.getTime() / 1000 : 0,
  }
}

export function recordNotificationWorkerHeartbeat(now = new Date()) {
  lastHeartbeatSeconds = now.getTime() / 1000
}

export function registerNotificationWorkerMetrics(db: PrismaClient = getDb()) {
  if (registered) return
  registered = true
  const meter = metrics.getMeter('organization-erp-notification-worker')
  const pending = meter.createObservableGauge('erp_notification_outbox_pending')
  const oldestAge = meter.createObservableGauge('erp_notification_outbox_oldest_age_seconds', { unit: 's' })
  const failed = meter.createObservableGauge('erp_notification_outbox_terminal_failed')
  const lastSuccess = meter.createObservableGauge('erp_notification_generation_last_success_timestamp_seconds', { unit: 's' })
  const heartbeat = meter.createObservableGauge('erp_notification_worker_heartbeat_timestamp_seconds', { unit: 's' })

  meter.addBatchObservableCallback(async (result) => {
    try {
      const snapshot = await collectNotificationWorkerMetrics(db)
      result.observe(pending, snapshot.pending)
      result.observe(oldestAge, snapshot.oldestAgeSeconds)
      result.observe(failed, snapshot.terminalFailed)
      result.observe(lastSuccess, snapshot.lastSuccessTimestampSeconds)
      result.observe(heartbeat, lastHeartbeatSeconds)
    } catch {
      // Monitoring must never interrupt notification delivery.
      console.warn('Notification worker metrics collection failed')
    }
  }, [pending, oldestAge, failed, lastSuccess, heartbeat])
}
