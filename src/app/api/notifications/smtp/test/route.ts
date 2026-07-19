import type { NextRequest } from 'next/server'
import { SmtpService } from '@/features/notifications/application/smtp.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError } from '@/lib/http/api-response'
import { z } from 'zod'

const smtpTestSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number().int().positive(),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  secure: z.boolean().default(false),
  fromEmail: z.string().email(),
})

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.update')
  if (auth.response) return auth.response

  const input = smtpTestSchema.safeParse(await request.json())
  if (!input.success) {
    return apiError('BAD_REQUEST', 'Неверный формат настроек', 400)
  }

  // If password was empty/redacted, load it from existing settings to allow testing
  const settingsToTest = { ...input.data }
  if (settingsToTest.password === '') {
    const existing = await SmtpService.getSettings()
    if (!existing) {
      return apiError('BAD_REQUEST', 'Пароль не может быть пустым при первой настройке', 400)
    }
    settingsToTest.password = existing.password
  }

  const success = await SmtpService.testConnection(settingsToTest)
  return apiData({ success })
}
