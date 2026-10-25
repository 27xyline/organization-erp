import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { createMaintenanceSchema } from '@/features/assets/contracts/maintenance'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.read')
  if (auth.response) return auth.response
  const { id } = await context.params
  return proxyAssetRequest(request, `/api/assets/${encodeURIComponent(id)}/maintenance`, auth.user, auth.requestId)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.update')
  if (auth.response) return auth.response
  const { id } = await context.params
  const input = createMaintenanceSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  return proxyAssetRequest(request, `/api/assets/${encodeURIComponent(id)}/maintenance`, auth.user, auth.requestId)
}
