import type { NextRequest } from 'next/server'
import { AssetService, AssetServiceError } from '@/features/assets/application/asset.service'
import { transferAssetSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

const messages: Record<string, [string, number]> = {
  ASSET_NOT_FOUND: ['Объект имущества не найден', 404],
  ASSET_ARCHIVED: ['Архивный объект нельзя передать', 409],
  HOLDING_NOT_FOUND: ['У выбранного МОЛ нет остатка этого объекта', 404],
  MOL_NOT_FOUND: ['МОЛ-получатель не найден', 404],
  INSUFFICIENT_QUANTITY: ['Недостаточный остаток для передачи', 422],
  CONCURRENT_UPDATE: ['Остаток изменился параллельно, повторите операцию', 409],
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = transferAssetSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)

  try {
    return apiData(await AssetService.transfer((await params).id, input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    if (error instanceof AssetServiceError && messages[error.code]) {
      const [message, status] = messages[error.code]
      return apiError(error.code, message, status)
    }
    throw error
  }
}
