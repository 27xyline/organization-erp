import type { NextRequest } from 'next/server'
import { getNotificationService } from '@/features/notifications/application/notification.service'
import { notificationPreferencesSchema } from '@/features/notifications/contracts/notification'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  return apiData(await getNotificationService().getPreferences(auth.user.id))
}

export async function PUT(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const input = notificationPreferencesSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  return apiData(await getNotificationService().updatePreferences(
    auth.user.id,
    input.data.preferences,
    auth.requestId,
  ))
}
