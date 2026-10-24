import type { NextRequest } from 'next/server'
import { GLOBAL_SEARCH_PERMISSIONS, globalSearchQuerySchema } from '@/features/search/contracts/search'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyStage12Request } from '@/lib/backend/stage12'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, { anyOf: GLOBAL_SEARCH_PERMISSIONS })
  if (auth.response) return auth.response

  const query = globalSearchQuerySchema.safeParse({ q: request.nextUrl.searchParams.get('q') })
  if (!query.success) return apiValidationError(query.error)
  return proxyStage12Request(
    request,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    auth.user,
    auth.requestId,
  )
}
