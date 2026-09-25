import { runNotificationWorker } from './notification-worker'

const controller = new AbortController()
process.once('SIGINT', () => controller.abort())
process.once('SIGTERM', () => controller.abort())

runNotificationWorker({ signal: controller.signal }).catch((error) => {
  console.error('Notification worker stopped unexpectedly', error)
  process.exitCode = 1
})
