import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError } from '@/lib/http/api-response'
import { assetTarget } from '@/lib/auth/resource-scopes'
import { proxyStage07Request } from '@/lib/backend/stage07'

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

  return proxyStage07Request(request, `/api/assets/${encodeURIComponent(id)}/restore`, auth.user, auth.requestId)
}
