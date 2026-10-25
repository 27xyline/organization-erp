import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { updateMaintenanceSchema } from '@/features/assets/contracts/maintenance'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; maintenanceId: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.update')
  if (auth.response) return auth.response
  const { id, maintenanceId } = await context.params
  const input = updateMaintenanceSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyAssetRequest(
    request,
    `/api/assets/${encodeURIComponent(id)}/maintenance/${encodeURIComponent(maintenanceId)}`,
    auth.user,
    auth.requestId,
  )
}
