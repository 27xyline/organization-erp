import nodemailer from 'nodemailer'
import { getDb } from '@/lib/prisma'
import { NotificationOutboxStatus } from '@prisma/client'
import { processNotificationOutbox } from './outbox.service'

export interface SmtpSettingsInput {
  host: string
  port: number
  username: string
  password: string
  secure: boolean
  fromEmail: string
}

export class SmtpService {
  static async getSettings() {
    const db = getDb()
    return db.smtpSettings.findUnique({
      where: { id: 'singleton' },
    })
  }

  static async saveSettings(input: SmtpSettingsInput) {
    const db = getDb()
    return db.smtpSettings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        ...input,
      },
      update: input,
    })
  }

  static async testConnection(input: SmtpSettingsInput): Promise<boolean> {
    try {
      const transporter = nodemailer.createTransport({
        host: input.host,
        port: input.port,
        secure: input.secure,
        auth: {
          user: input.username,
          pass: input.password,
        },
        connectTimeout: 5000,
      } as any)
      await transporter.verify()
      return true
    } catch (error) {
      console.error('SMTP verification failed:', error)
      return false
    }
  }

  static async sendEmail(settings: SmtpSettingsInput, to: string, subject: string, body: string) {
    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: {
        user: settings.username,
        pass: settings.password,
      },
    } as any)
    await transporter.sendMail({
      from: settings.fromEmail,
      to,
      subject,
      text: body,
    })
  }

  static async processOutbox() {
    const settings = await this.getSettings()
    if (!settings) {
      console.warn('SMTP settings not configured, skipping outbox processing')
      return { sent: 0, failed: 0, skipped: 0 }
    }

    const db = getDb()

    // Implement a simple EmailNotificationSender that queries the user's email first
    const sender = {
      send: async (input: {
        userId: string
        eventType: string
        title: string
        body: string
      }) => {
        const user = await db.user.findUnique({
          where: { id: input.userId },
          select: {
            username: true,
            employee: {
              select: { email: true },
            },
          },
        })
        if (!user) {
          throw new Error(`User not found: ${input.userId}`)
        }
        const email = user.employee?.email || (user.username.includes('@') ? user.username : null)
        if (!email) {
          throw new Error(`User ${user.username} has no email address configured`)
        }
        await this.sendEmail(settings, email, input.title, input.body)
      },
    }

    // Call the processing with custom backoff handling
    // 1. Fetch pending items
    const pending = await db.notificationOutbox.findMany({
      where: {
        status: { in: [NotificationOutboxStatus.PENDING, NotificationOutboxStatus.FAILED] },
        attempts: { lt: 5 },
        availableAt: { lte: new Date() },
      },
      orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
      take: 50,
    })

    let sent = 0
    let failed = 0

    for (const item of pending) {
      const payload = item.payload as {
        eventType: string
        title: string
        body: string
        targetUrl?: string | null
      }
      try {
        await sender.send({ userId: item.userId, ...payload })
        await db.notificationOutbox.update({
          where: { id: item.id },
          data: {
            status: NotificationOutboxStatus.SENT,
            processedAt: new Date(),
            attempts: { increment: 1 },
            lastError: null,
          },
        })
        sent += 1
      } catch (error: any) {
        const attempts = item.attempts + 1
        const minutesToWait = Math.pow(2, attempts) // Exponential backoff: 2, 4, 8, 16, 32 minutes
        const availableAt = new Date(Date.now() + minutesToWait * 60 * 1000)

        await db.notificationOutbox.update({
          where: { id: item.id },
          data: {
            status: attempts >= 5 ? NotificationOutboxStatus.FAILED : NotificationOutboxStatus.PENDING,
            attempts,
            availableAt,
            lastError: error instanceof Error ? error.message.slice(0, 1000) : 'UNKNOWN_ERROR',
          },
        })
        failed += 1
      }
    }

    return { sent, failed, skipped: 0 }
  }
}
