import type { NextRequest } from 'next/server'
import { notificationPreferencesSchema } from '@/features/notifications/contracts/notification'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyStage09 } from '@/lib/backend/stage09'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  return proxyStage09(request, '/api/notifications/preferences', auth.user, auth.requestId)
}

export async function PUT(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const input = notificationPreferencesSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyStage09(request, '/api/notifications/preferences', auth.user, auth.requestId)
}
