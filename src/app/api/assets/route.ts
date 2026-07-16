import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { AssetService } from '@/features/assets/asset.service'
import { assetsQuerySchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiList, apiValidationError } from '@/lib/http/api-response'
import { createAssetSchema } from '@/features/assets/contracts/schemas'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
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

  const result = await AssetService.list(query.data)
  return apiList(result.assets, { page: query.data.page, pageSize: query.data.pageSize, total: result.total })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response

  const input = createAssetSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)

  try {
    return apiData(await AssetService.create(input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('INVENTORY_NUMBER_EXISTS', 'Инвентарный номер уже используется', 409)
    }
    throw error
  }
}
