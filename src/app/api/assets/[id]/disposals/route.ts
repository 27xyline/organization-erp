import type { NextRequest } from 'next/server'
import { disposeAssetSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { departmentForMol } from '@/lib/auth/resource-scopes'
import { proxyStage07Request } from '@/lib/backend/stage07'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.dispose')
  if (auth.response) return auth.response
  const input = disposeAssetSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const departmentId = await departmentForMol(input.data.fromMolId)
  if (departmentId && !auth.access.allows('assets.dispose', { departmentId })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }

  const { id } = await params
  return proxyStage07Request(request, `/api/assets/${encodeURIComponent(id)}/disposals`, auth.user, auth.requestId)
}
