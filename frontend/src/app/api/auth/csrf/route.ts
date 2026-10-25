import { proxySessionRequest } from '@/lib/backend/session'
import { backendUnavailableResponse } from '@/lib/backend/client'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  try {
    return await proxySessionRequest(request, '/api/auth/csrf')
  } catch (error) {
    return backendUnavailableResponse(error, request.headers.get('x-request-id') ?? undefined)
  }
}
