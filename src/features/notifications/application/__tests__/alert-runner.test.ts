import { describe, expect, it, vi } from 'vitest'
import { runScheduledAlertGeneration } from '../alert-runner'

function createStore(lastSucceededAt: Date | null = null, lastStartedAt: Date | null = null) {
  return {
    scheduledAlertRun: {
      findUnique: vi.fn().mockResolvedValue(lastSucceededAt || lastStartedAt ? { lastSucceededAt, lastStartedAt } : null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  }
}

describe('runScheduledAlertGeneration', () => {
  const now = new Date('2026-09-25T12:00:00.000Z')

  it('runs immediately when a missed hourly run has no success record', async () => {
    const db = createStore()
    const generate = vi.fn().mockResolvedValue({ generated: 2, emailQueued: 1, sources: {} })

    const result = await runScheduledAlertGeneration({ db: db as never, generate, now })

    expect(result).toMatchObject({ ran: true, generated: 2 })
    expect(generate).toHaveBeenCalledOnce()
    expect(db.scheduledAlertRun.upsert).toHaveBeenCalledTimes(2)
    expect(db.scheduledAlertRun.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: expect.objectContaining({ lastSucceededAt: now, lastError: null }),
    }))
  })

  it('skips a recent successful run but permits an explicit manual run', async () => {
    const db = createStore(new Date('2026-09-25T11:30:00.000Z'))
    const generate = vi.fn().mockResolvedValue({ generated: 0, emailQueued: 0, sources: {} })

    expect(await runScheduledAlertGeneration({ db: db as never, generate, now })).toEqual({ ran: false })
    expect(generate).not.toHaveBeenCalled()

    expect(await runScheduledAlertGeneration({ db: db as never, generate, now, force: true })).toMatchObject({ ran: true })
    expect(generate).toHaveBeenCalledOnce()
  })

  it('retries failed generation after the five-minute backoff and records errors', async () => {
    const db = createStore(null, new Date('2026-09-25T11:54:00.000Z'))
    const generate = vi.fn().mockRejectedValue(new Error('database unavailable'))

    await expect(runScheduledAlertGeneration({ db: db as never, generate, now })).rejects.toThrow('database unavailable')
    expect(db.scheduledAlertRun.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: expect.objectContaining({ lastError: 'database unavailable' }),
    }))
  })

  it('does not retry immediately after a failed attempt', async () => {
    const db = createStore(null, new Date('2026-09-25T11:57:00.000Z'))
    const generate = vi.fn()
    expect(await runScheduledAlertGeneration({ db: db as never, generate, now })).toEqual({ ran: false })
    expect(generate).not.toHaveBeenCalled()
  })
})
