import type { NextRequest } from 'next/server'
import { SmtpService } from '@/features/notifications/application/smtp.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError } from '@/lib/http/api-response'
import { z } from 'zod'

const smtpSettingsSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number().int().positive(),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  secure: z.boolean().default(false),
  fromEmail: z.string().email(),
})

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.update')
  if (auth.response) return auth.response

  const settings = await SmtpService.getSettings()
  if (!settings) {
    return apiData(null)
  }

  return apiData({
    host: settings.host,
    port: settings.port,
    username: settings.username,
    secure: settings.secure,
    fromEmail: settings.fromEmail,
    password: '', // Redact password
  })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.update')
  if (auth.response) return auth.response

  const input = smtpSettingsSchema.safeParse(await request.json())
  if (!input.success) {
    return apiError('BAD_REQUEST', 'Неверный формат настроек', 400)
  }

  const saved = await SmtpService.saveSettings(input.data)
  return apiData({
    host: saved.host,
    port: saved.port,
    username: saved.username,
    secure: saved.secure,
    fromEmail: saved.fromEmail,
    password: '',
  })
}
