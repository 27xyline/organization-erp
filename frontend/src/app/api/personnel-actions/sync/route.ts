import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'personnelActions.sync')
  if (auth.response) return auth.response
  try {
    return await proxyBackendRequest(request, '/api/personnel-actions/sync', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
