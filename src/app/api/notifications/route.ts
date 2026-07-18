import type { NextRequest } from 'next/server'
import { getNotificationService } from '@/features/notifications/application/notification.service'
import { notificationsQuerySchema } from '@/features/notifications/contracts/notification'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiList, apiValidationError } from '@/lib/http/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response

  const query = notificationsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  )
  if (!query.success) return apiValidationError(query.error)

  const result = await getNotificationService().list(auth.user.id, query.data)
  return apiList(result.notifications, {
    page: query.data.page,
    pageSize: query.data.pageSize,
    total: result.total,
  })
}
