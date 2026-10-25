import type { NextRequest } from 'next/server'
import { notificationsQuerySchema } from '@/features/notifications/contracts/notification'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyStage09 } from '@/lib/backend/stage09'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response

  const query = notificationsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  )
  if (!query.success) return apiValidationError(query.error)

  return proxyStage09(request, `/api/notifications${request.nextUrl.search}`, auth.user, auth.requestId)
}
