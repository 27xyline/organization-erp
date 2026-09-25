import nodemailer from 'nodemailer'
import { getDb } from '@/lib/prisma'
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
        connectionTimeout: 30_000,
        greetingTimeout: 30_000,
        socketTimeout: 60_000,
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
        if (!user) throw new Error('RECIPIENT_NOT_FOUND')
        const email = user.employee?.email || (user.username.includes('@') ? user.username : null)
        if (!email) throw new Error('RECIPIENT_EMAIL_MISSING')
        await this.sendEmail(settings, email, input.title, input.body)
      },
    }

    return processNotificationOutbox(sender, db)
  }
}
