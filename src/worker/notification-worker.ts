import { setTimeout } from 'node:timers/promises'
import { SmtpService } from '@/features/notifications/application/smtp.service'
import { runScheduledAlertGeneration } from '@/features/notifications/application/alert-runner'
import { recordNotificationWorkerHeartbeat, registerNotificationWorkerMetrics } from './metrics'

type WorkerDependencies = {
  signal: AbortSignal
  processOutbox?: typeof SmtpService.processOutbox
  runAlerts?: typeof runScheduledAlertGeneration
  sleep?: (durationMs: number, signal: AbortSignal) => Promise<unknown>
  logError?: (processor: string, error: unknown) => void
}

const sleepUntilNextCycle = (durationMs: number, signal: AbortSignal) =>
  setTimeout(durationMs, undefined, { signal })

export async function runNotificationWorker({
  signal,
  processOutbox = () => SmtpService.processOutbox(),
  runAlerts = runScheduledAlertGeneration,
  sleep = sleepUntilNextCycle,
  logError = (processor, error) => console.error(`Notification worker ${processor} failed`, error),
}: WorkerDependencies) {
  registerNotificationWorkerMetrics()
  while (!signal.aborted) {
    recordNotificationWorkerHeartbeat()
    // Keep the two jobs independent: an SMTP outage must not stop alert generation.
    const results = await Promise.allSettled([processOutbox(), runAlerts()])
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') logError(index === 0 ? 'outbox' : 'alerts', result.reason)
    }
    if (signal.aborted) break
    try {
      await sleep(30_000, signal)
    } catch (error) {
      if (!signal.aborted) throw error
    }
  }
}
