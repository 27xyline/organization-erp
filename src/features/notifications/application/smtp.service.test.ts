import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SmtpService } from './smtp.service'
import { getDb } from '@/lib/prisma'

const dbMock = vi.hoisted(() => ({
  smtpSettings: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { findUnique: vi.fn() },
  notificationOutbox: { updateMany: vi.fn() },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}))

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: vi.fn().mockResolvedValue(true) }) },
}))

vi.mock('@/lib/prisma', () => ({
  getDb: vi.fn(() => dbMock),
}))

describe('SmtpService', () => {
  const db = getDb() as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not claim mail when SMTP is unconfigured', async () => {
    db.smtpSettings.findUnique.mockResolvedValue(null)
    expect(await SmtpService.processOutbox()).toEqual({ sent: 0, failed: 0, skipped: 0 })
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })

  it('uses the shared processor and sends claimed mail', async () => {
    db.smtpSettings.findUnique.mockResolvedValue({
      host: 'smtp.example.com', port: 587, username: 'user', password: 'pwd',
      secure: false, fromEmail: 'noreply@example.com',
    })
    db.$executeRaw.mockResolvedValue(0)
    db.$queryRaw.mockResolvedValueOnce([{
      id: 'out-1', userId: 'user-1', attempts: 1,
      payload: { eventType: 'TEST', title: 'Title', body: 'Body' },
    }]).mockResolvedValue([])
    db.user.findUnique.mockResolvedValue({ username: 'user@example.com', employee: null })
    db.notificationOutbox.updateMany.mockResolvedValue({ count: 1 })

    expect(await SmtpService.processOutbox()).toEqual({ sent: 1, failed: 0, skipped: 0 })
    expect(db.notificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'out-1', claimToken: expect.any(String) }),
      data: expect.objectContaining({ status: 'SENT' }),
    }))
  })
})
