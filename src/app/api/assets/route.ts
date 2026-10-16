import type { NextRequest } from 'next/server'
import { assetsQuerySchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { createAssetSchema } from '@/features/assets/contracts/schemas'
import { departmentForMol } from '@/lib/auth/resource-scopes'
import { proxyStage07AssetJsonRequest, proxyStage07Request } from '@/lib/backend/stage07'
import { normalizeLegacyAssetDates } from '@/features/assets/infrastructure/legacy-date-transport'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response

  const rawQuery = Object.fromEntries(request.nextUrl.searchParams)
  if (rawQuery.isArchived !== undefined && rawQuery.archived === undefined) {
    rawQuery.archived = rawQuery.isArchived
  }
  if (rawQuery.limit !== undefined && rawQuery.pageSize === undefined) {
    rawQuery.pageSize = rawQuery.limit
  }
  const query = assetsQuerySchema.safeParse(rawQuery)
  if (!query.success) return apiValidationError(query.error)

  return proxyStage07Request(request, `${request.nextUrl.pathname}${request.nextUrl.search}`, auth.user, auth.requestId)
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.create')
  if (auth.response) return auth.response

  const input = createAssetSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const departmentId = await departmentForMol(input.data.molId)
  if (departmentId && !auth.access.allows('assets.create', { departmentId })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }

  return proxyStage07AssetJsonRequest(
    request, '/api/assets', auth.user, auth.requestId, normalizeLegacyAssetDates(input.data),
  )
}
