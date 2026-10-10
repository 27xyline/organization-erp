import type { NextRequest } from 'next/server'
import { changePasswordSchema } from '@/features/users/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { proxyBackendRequest } from '@/lib/backend/bridge'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response

  const input = changePasswordSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)

  try {
    return await proxyBackendRequest(request, '/api/account/password', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
