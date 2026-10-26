import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError } from '@/lib/http/api-response'
import { z } from 'zod'
import { proxyNotificationRequest } from '@/lib/backend/notifications'

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

  const input = smtpTestSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) {
    return apiError('BAD_REQUEST', 'Неверный формат настроек', 400)
  }

  return proxyNotificationRequest(request, '/api/notifications/smtp/test', auth.user, auth.requestId)
}
