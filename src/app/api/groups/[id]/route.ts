import type { NextRequest } from 'next/server'
import { createGroupSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiValidationError } from '@/lib/http/api-response'

type RouteContext = { params: Promise<{ id: string }> }

async function forward(request: NextRequest, id: string, permission: 'assetGroups.read' | 'assetGroups.update' | 'assetGroups.delete') {
  const auth = await authorizeApiRequest(request, permission)
  if (auth.response) return auth.response
  try {
    return await proxyBackendRequest(
      request,
      `/api/groups/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  return forward(request, id, 'assetGroups.read')
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await authorizeApiRequest(request, 'assetGroups.update')
  if (auth.response) return auth.response

  const input = createGroupSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  const { id } = await params
  try {
    return await proxyBackendRequest(
      request,
      `/api/groups/${encodeURIComponent(id)}`,
      auth.user,
      auth.requestId,
    )
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  return forward(request, id, 'assetGroups.delete')
}
