import type { NextRequest } from 'next/server'
import { AssetService } from '@/features/assets/application/asset.service'
import { operationsQuerySchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiList, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response

  const query = operationsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)
  const result = await AssetService.listOperations(query.data)
  return apiList(result.operations, {
    page: query.data.page,
    pageSize: query.data.pageSize,
    total: result.total,
  })
}
