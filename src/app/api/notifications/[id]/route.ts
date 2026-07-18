import type { NextRequest } from 'next/server'
import { notificationApiError } from '@/features/notifications/application/http'
import { getNotificationService } from '@/features/notifications/application/notification.service'
import { notificationStateSchema } from '@/features/notifications/contracts/notification'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const input = notificationStateSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const { id } = await context.params
  try {
    await getNotificationService().setRead(auth.user.id, id, input.data.read)
    return apiData({ id, read: input.data.read })
  } catch (error) {
    return notificationApiError(error)
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const { id } = await context.params
  try {
    await getNotificationService().delete(auth.user.id, id)
    return apiData({ id, deleted: true })
  } catch (error) {
    return notificationApiError(error)
  }
}
