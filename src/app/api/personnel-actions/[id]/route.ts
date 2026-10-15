import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiError } from '@/lib/http/api-response'
import { personnelActionTarget } from '@/lib/auth/resource-scopes'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'personnelActions.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await personnelActionTarget(id)
  if (target && !auth.access.allows('personnelActions.delete', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(
      request,
      `/api/personnel-actions/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
