import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { assetTarget } from '@/lib/auth/resource-scopes'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { createMaintenanceSchema } from '@/features/assets/contracts/maintenance'
import { AssetLifecycleService } from '@/features/assets/application/asset-lifecycle.service'
import { assetLifecycleApiError } from '@/features/assets/application/asset-lifecycle-http'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response
  const { id } = await context.params
  const target = await assetTarget(id)
  if (!target) return apiError('ASSET_NOT_FOUND', 'Имущество не найдено', 404)
  if (!auth.access.allows('assets.read', target)) return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  return apiData(await AssetLifecycleService.list(id))
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.update')
  if (auth.response) return auth.response
  const { id } = await context.params
  const target = await assetTarget(id)
  if (!target) return apiError('ASSET_NOT_FOUND', 'Имущество не найдено', 404)
  if (!auth.access.allows('assets.update', target)) return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  const input = createMaintenanceSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(
      await AssetLifecycleService.create(id, input.data, auth.user.id, auth.requestId),
      { status: 201 },
    )
  } catch (error) {
    return assetLifecycleApiError(error)
  }
}
