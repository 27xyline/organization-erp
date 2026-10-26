import type { NextRequest } from 'next/server'
import { notificationPreferencesSchema } from '@/features/notifications/contracts/notification'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyNotificationRequest } from '@/lib/backend/notifications'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  return proxyNotificationRequest(request, '/api/notifications/preferences', auth.user, auth.requestId)
}

export async function PUT(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const input = notificationPreferencesSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyNotificationRequest(request, '/api/notifications/preferences', auth.user, auth.requestId)
}
