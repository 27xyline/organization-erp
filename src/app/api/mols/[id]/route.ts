import type { NextRequest } from 'next/server'
import { createMolSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiValidationError } from '@/lib/http/api-response'

type RouteContext = { params: Promise<{ id: string }> }

async function forward(
  request: NextRequest,
  id: string,
  permission: 'mols.read' | 'mols.delete',
) {
  const auth = await authorizeApiRequest(request, permission)
  if (auth.response) return auth.response
  try {
    return await proxyBackendRequest(
      request,
      `/api/mols/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  return forward(request, id, 'mols.read')
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await authorizeApiRequest(request, 'mols.update')
  if (auth.response) return auth.response

  const input = createMolSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const { id } = await params
  try {
    return await proxyBackendRequest(
      request,
      `/api/mols/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  return forward(request, id, 'mols.delete')
}
