import { startObservability, stopObservability } from '../lib/observability/otel'

const controller = new AbortController()
process.once('SIGINT', () => controller.abort())
process.once('SIGTERM', () => controller.abort())

async function main() {
  // Register Prisma instrumentation before importing the worker and its DB client.
  startObservability('organization-erp-notification-worker')
  try {
    const { runNotificationWorker } = await import('./notification-worker')
    await runNotificationWorker({ signal: controller.signal })
  } finally {
    await stopObservability()
  }
}

main().catch((error) => {
  console.error('Notification worker stopped unexpectedly', error)
  process.exitCode = 1
})
