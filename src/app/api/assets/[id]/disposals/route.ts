import type { NextRequest } from 'next/server'
import { AssetService, AssetServiceError } from '@/features/assets/application/asset.service'
import { disposeAssetSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { departmentForMol } from '@/lib/auth/resource-scopes'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.dispose')
  if (auth.response) return auth.response
  const input = disposeAssetSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const departmentId = await departmentForMol(input.data.fromMolId)
  if (departmentId && !auth.access.allows('assets.dispose', { departmentId })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }

  try {
    return apiData(await AssetService.dispose((await params).id, input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    if (error instanceof AssetServiceError) {
      const status = error.code === 'ASSET_NOT_FOUND' || error.code === 'HOLDING_NOT_FOUND' ? 404 : 409
      return apiError(error.code, error.code === 'INSUFFICIENT_QUANTITY' ? 'Недостаточный остаток для списания' : 'Операция списания невозможна', status)
    }
    throw error
  }
}
