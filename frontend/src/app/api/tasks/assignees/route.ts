import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'
export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'tasks.create')
  if (auth.response) return auth.response
  try { return await proxyBackendRequest(request, '/api/tasks/assignees', auth.user, auth.requestId) }
  catch (error) { return backendUnavailableResponse(error, auth.requestId) }
}
