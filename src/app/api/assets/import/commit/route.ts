import type { NextRequest } from 'next/server'
import { assetImportCommitSchema } from '@/features/assets/contracts/asset-import'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { departmentForMol } from '@/lib/auth/resource-scopes'
import { proxyStage07Request } from '@/lib/backend/stage07'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.create')
  if (auth.response) return auth.response

  const payload = await request.clone().json().catch(() => null)
  const input = assetImportCommitSchema.safeParse(payload)
  if (!input.success) return apiValidationError(input.error)

  const departmentIds = (await Promise.all(
    input.data.assets.map((asset) => departmentForMol(asset.molId)),
  )).filter((value): value is string => Boolean(value))
  if (departmentIds.some((departmentId) => !auth.access.allows('assets.create', { departmentId }))) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }

  return proxyStage07Request(request, '/api/assets/import/commit', auth.user, auth.requestId)
}
