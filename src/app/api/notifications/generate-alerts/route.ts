import type { NextRequest } from 'next/server'
import { generateScheduledAlerts } from '@/features/notifications/application/scheduled-alerts'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.update')
  if (auth.response) return auth.response
  return apiData(await generateScheduledAlerts({
    actorId: auth.user.id,
    requestId: auth.requestId,
  }))
}
