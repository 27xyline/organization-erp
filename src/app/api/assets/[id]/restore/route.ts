import type { NextRequest } from 'next/server'
import { AssetService, AssetServiceError } from '@/features/assets/application/asset.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError } from '@/lib/http/api-response'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response

  try {
    return apiData(await AssetService.restore((await params).id, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof AssetServiceError) {
      return apiError(
        error.code,
        error.code === 'ASSET_NOT_FOUND'
          ? 'Объект имущества не найден'
          : 'Полностью списанный объект нельзя восстановить без нового поступления',
        error.code === 'ASSET_NOT_FOUND' ? 404 : 409,
      )
    }
    throw error
  }
}
