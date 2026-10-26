import type { NextRequest } from 'next/server'
import { operationsQuerySchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'operations.read')
  if (auth.response) return auth.response

  const query = operationsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  return proxyAssetRequest(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}
