import type { NextRequest } from 'next/server'
import { archiveAssetSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { assetTarget } from '@/lib/auth/resource-scopes'
import { proxyStage07Request } from '@/lib/backend/stage07'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'assets.archive')
  if (auth.response) return auth.response
  const input = archiveAssetSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id
  const target = await assetTarget(id)
  if (target && !auth.access.allows('assets.archive', { departmentIds: target.departmentIds })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }

  return proxyStage07Request(request, `/api/assets/${encodeURIComponent(id)}/archive`, auth.user, auth.requestId)
}
