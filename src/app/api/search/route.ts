import type { NextRequest } from 'next/server'
import { GlobalSearchService } from '@/features/search/application/global-search.service'
import { GLOBAL_SEARCH_PERMISSIONS, globalSearchQuerySchema } from '@/features/search/contracts/search'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, { anyOf: GLOBAL_SEARCH_PERMISSIONS })
  if (auth.response) return auth.response

  const query = globalSearchQuerySchema.safeParse({ q: request.nextUrl.searchParams.get('q') })
  if (!query.success) return apiValidationError(query.error)
  return apiData(await GlobalSearchService.search(query.data.q, auth.access))
}
