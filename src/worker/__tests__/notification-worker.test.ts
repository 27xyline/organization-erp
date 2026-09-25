import { describe, expect, it, vi } from 'vitest'
import { runNotificationWorker } from '../notification-worker'

describe('notification worker', () => {
  it('runs both processors at startup and keeps processing when one fails', async () => {
    const controller = new AbortController()
    const processOutbox = vi.fn().mockRejectedValueOnce(new Error('smtp unavailable')).mockResolvedValue({ sent: 1 })
    const runAlerts = vi.fn().mockResolvedValue({ ran: true })
    const sleep = vi.fn().mockImplementation(async () => {
      if (sleep.mock.calls.length === 2) controller.abort()
    })
    const logError = vi.fn()

    await runNotificationWorker({ signal: controller.signal, processOutbox, runAlerts, sleep, logError })

    expect(processOutbox).toHaveBeenCalledTimes(2)
    expect(runAlerts).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(30_000, controller.signal)
    expect(logError).toHaveBeenCalledWith('outbox', expect.any(Error))
  })
})
