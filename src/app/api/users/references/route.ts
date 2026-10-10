import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { proxyBackendRequest } from '@/lib/backend/bridge'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.read')
  if (auth.response) return auth.response
  try {
    return await proxyBackendRequest(request, '/api/users/references', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
