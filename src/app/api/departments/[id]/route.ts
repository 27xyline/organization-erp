import type { NextRequest } from 'next/server'
import { updateDepartmentSchema } from '@/features/departments/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiValidationError } from '@/lib/http/api-response'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authorizeApiRequest(request, 'departments.update')
  if (auth.response) return auth.response

  const input = updateDepartmentSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)

  const { id } = await params
  try {
    return await proxyBackendRequest(
      request,
      `/api/departments/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authorizeApiRequest(request, 'departments.delete')
  if (auth.response) return auth.response

  const { id } = await params
  try {
    return await proxyBackendRequest(
      request,
      `/api/departments/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
