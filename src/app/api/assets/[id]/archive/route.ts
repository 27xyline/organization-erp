import type { NextRequest } from 'next/server'
import { AssetService, AssetServiceError } from '@/features/assets/application/asset.service'
import { archiveAssetSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { assetTarget } from '@/lib/auth/resource-scopes'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.archive')
  if (auth.response) return auth.response
  const input = archiveAssetSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id
  const target = await assetTarget(id)
  if (target && !auth.access.allows('assets.archive', { departmentIds: target.departmentIds })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }

  try {
    return apiData(await AssetService.archive(id, input.data.reason, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof AssetServiceError && error.code === 'ASSET_NOT_FOUND') {
      return apiError(error.code, 'Объект имущества не найден', 404)
    }
    throw error
  }
}
