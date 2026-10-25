import { backendUnavailableResponse, forwardedResponse, backendFetch } from '@/lib/backend/client'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const response = await backendFetch('/api/health/ready', {
      headers: { 'x-request-id': request.headers.get('x-request-id') ?? crypto.randomUUID() },
    })
    return forwardedResponse(response)
  } catch (error) {
    return backendUnavailableResponse(error, request.headers.get('x-request-id') ?? undefined)
  }
}
