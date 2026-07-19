import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('nodemailer', () => {
  const transporter = {
    verify: () => Promise.resolve(true),
    sendMail: () => Promise.resolve(true),
  }
  return {
    createTransport: () => transporter,
    default: {
      createTransport: () => transporter,
    }
  }
})

import { SmtpService } from './smtp.service'
import { getDb } from '@/lib/prisma'
import { NotificationOutboxStatus } from '@prisma/client'

vi.mock('@/lib/prisma', () => {
  const mockDb = {
    smtpSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    notificationOutbox: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  }
  return {
    getDb: () => mockDb,
  }
})

describe('SmtpService', () => {
  const db = getDb() as any

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('gets and saves settings', async () => {
    db.smtpSettings.findUnique.mockResolvedValueOnce({ host: 'smtp.example.com' })
    const settings = await SmtpService.getSettings()
    expect(settings?.host).toBe('smtp.example.com')
  })

  it('processes outbox and retries with backoff', async () => {
    db.smtpSettings.findUnique.mockResolvedValueOnce({
      host: 'smtp.example.com',
      port: 587,
      username: 'user',
      password: 'pwd',
      secure: false,
      fromEmail: 'noreply@example.com',
    })

    db.notificationOutbox.findMany.mockResolvedValueOnce([
      {
        id: 'out-1',
        userId: 'user-1',
        payload: { eventType: 'TEST', title: 'Title', body: 'Body' },
        attempts: 0,
      },
    ])

    db.user.findUnique.mockResolvedValueOnce({
      username: 'user-1@example.com',
      employee: null,
    })

    const result = await SmtpService.processOutbox()
    expect(result.sent).toBe(1)
    expect(db.notificationOutbox.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'out-1' },
        data: expect.objectContaining({ status: NotificationOutboxStatus.SENT }),
      })
    )
  })
})
