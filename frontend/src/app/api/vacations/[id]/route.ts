import type { NextRequest } from 'next/server'
import { createVacationSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiValidationError } from '@/lib/http/api-response'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'vacations.update')
  if (auth.response) return auth.response
  const input = createVacationSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id
  try {
    return await proxyBackendRequest(
      request,
      `/api/vacations/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'vacations.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  try {
    return await proxyBackendRequest(
      request,
      `/api/vacations/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
