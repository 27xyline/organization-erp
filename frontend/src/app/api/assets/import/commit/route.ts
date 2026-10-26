import type { NextRequest } from 'next/server'
import { assetImportCommitSchema } from '@/features/assets/contracts/asset-import'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { proxyAssetRequest } from '@/lib/backend/assets'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assets.create')
  if (auth.response) return auth.response

  const payload = await request.clone().json().catch(() => null)
  const input = assetImportCommitSchema.safeParse(payload)
  if (!input.success) return apiValidationError(input.error)

  return proxyAssetRequest(request, '/api/assets/import/commit', auth.user, auth.requestId)
}
