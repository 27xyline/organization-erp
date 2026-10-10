import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { updateUserSchema } from '@/features/users/contracts/schemas'
import { apiValidationError } from '@/lib/http/api-response'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { proxyBackendRequest } from '@/lib/backend/bridge'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'access.users.update')
  if (auth.response) return auth.response

  const input = updateUserSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)

  try {
    return await proxyBackendRequest(
      request,
      `/api/users/${encodeURIComponent((await params).id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
