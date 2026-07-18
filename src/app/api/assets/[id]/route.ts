import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { AssetService, AssetServiceError } from '@/features/assets/application/asset.service'
import { updateAssetSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { assetTarget } from '@/lib/auth/resource-scopes'

const errorMap: Record<string, { message: string; status: number }> = {
  ASSET_NOT_FOUND: { message: 'Объект имущества не найден', status: 404 },
  QUANTITY_OPERATION_REQUIRED: { message: 'Количество изменяется только операцией поступления или списания', status: 409 },
  MOL_TRANSFER_REQUIRED: { message: 'МОЛ изменяется только через операцию передачи', status: 409 },
  CONCURRENT_UPDATE: { message: 'Данные изменились параллельно, повторите операцию', status: 409 },
}

function mapAssetError(error: unknown) {
  if (error instanceof AssetServiceError && errorMap[error.code]) {
    const mapped = errorMap[error.code]
    return apiError(error.code, mapped.message, mapped.status)
  }
  return null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response

  const id = (await params).id
  const target = await assetTarget(id)
  if (target && !auth.access.allows('assets.read', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  const asset = await AssetService.get(id, auth.access)
  return asset ? apiData(asset) : apiError('ASSET_NOT_FOUND', 'Объект имущества не найден', 404)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.update')
  if (auth.response) return auth.response

  const input = updateAssetSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id
  const target = await assetTarget(id)
  if (target && !auth.access.allows('assets.update', { departmentIds: target.departmentIds })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }

  try {
    return apiData(await AssetService.update(id, input.data, auth.user.id, auth.requestId))
  } catch (error) {
    const mapped = mapAssetError(error)
    if (mapped) return mapped
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return apiError('INVENTORY_NUMBER_EXISTS', 'Инвентарный номер уже используется', 409)
    }
    throw error
  }
}
