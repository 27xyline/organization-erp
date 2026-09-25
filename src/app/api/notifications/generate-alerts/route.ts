import type { NextRequest } from 'next/server'
import { runScheduledAlertGeneration } from '@/features/notifications/application/alert-runner'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.update')
  if (auth.response) return auth.response
  return apiData(await runScheduledAlertGeneration({
    force: true,
    actorId: auth.user.id,
    requestId: auth.requestId,
  }))
}
