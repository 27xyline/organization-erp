import { backendUnavailableResponse } from '@/lib/backend/client'
import { proxySessionRequest } from '@/lib/backend/session'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  try {
    return await proxySessionRequest(request, '/api/account/me')
  } catch (error) {
    return backendUnavailableResponse(error, request.headers.get('x-request-id') ?? undefined)
  }
}
