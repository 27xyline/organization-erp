import type { NextRequest } from 'next/server'
import { AssetService, AssetServiceError } from '@/features/assets/application/asset.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError } from '@/lib/http/api-response'
import { assetTarget } from '@/lib/auth/resource-scopes'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.restore')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await assetTarget(id)
  if (target && !auth.access.allows('assets.restore', { departmentIds: target.departmentIds })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }

  try {
    return apiData(await AssetService.restore(id, auth.user.id, auth.requestId))
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
