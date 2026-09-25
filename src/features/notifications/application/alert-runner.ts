import type { PrismaClient } from '@prisma/client'
import { getDb } from '@/lib/prisma'
import { generateScheduledAlerts } from './scheduled-alerts'

const RUN_KEY = 'scheduled-alerts'
const HOUR_MS = 60 * 60 * 1000
const RETRY_MS = 5 * 60 * 1000

type AlertResult = Awaited<ReturnType<typeof generateScheduledAlerts>>

export async function runScheduledAlertGeneration(input: {
  db?: PrismaClient
  now?: Date
  force?: boolean
  actorId?: string
  requestId?: string
  generate?: typeof generateScheduledAlerts
} = {}): Promise<{ ran: false } | ({ ran: true } & AlertResult)> {
  const db = input.db ?? getDb()
  const now = input.now ?? new Date()
  const state = await db.scheduledAlertRun.findUnique({ where: { key: RUN_KEY } })
  if (!input.force) {
    const recentlySucceeded = state?.lastSucceededAt && now.getTime() - state.lastSucceededAt.getTime() < HOUR_MS
    const recentlyAttempted = state?.lastStartedAt && now.getTime() - state.lastStartedAt.getTime() < RETRY_MS
    if (recentlySucceeded || recentlyAttempted) return { ran: false }
  }

  await db.scheduledAlertRun.upsert({
    where: { key: RUN_KEY },
    create: { key: RUN_KEY, lastStartedAt: now },
    update: { lastStartedAt: now },
  })

  try {
    const result = await (input.generate ?? generateScheduledAlerts)({
      now,
      actorId: input.actorId,
      requestId: input.requestId,
    })
    await db.scheduledAlertRun.upsert({
      where: { key: RUN_KEY },
      create: { key: RUN_KEY, lastStartedAt: now, lastSucceededAt: now },
      update: { lastSucceededAt: now, lastError: null },
    })
    return { ran: true, ...result }
  } catch (error) {
    await db.scheduledAlertRun.upsert({
      where: { key: RUN_KEY },
      create: { key: RUN_KEY, lastStartedAt: now, lastError: errorMessage(error) },
      update: { lastError: errorMessage(error) },
    })
    throw error
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : 'UNKNOWN_ERROR'
}
