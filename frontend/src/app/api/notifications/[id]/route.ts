import type { NextRequest } from 'next/server'
import { notificationStateSchema } from '@/features/notifications/contracts/notification'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyNotificationRequest } from '@/lib/backend/notifications'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const input = notificationStateSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  const { id } = await context.params
  return proxyNotificationRequest(request, `/api/notifications/${encodeURIComponent(id)}`, auth.user, auth.requestId)
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const { id } = await context.params
  return proxyNotificationRequest(request, `/api/notifications/${encodeURIComponent(id)}`, auth.user, auth.requestId)
}
