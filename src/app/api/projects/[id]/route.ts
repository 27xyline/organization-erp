import type { NextRequest } from 'next/server'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { createProjectSchema } from '@/features/projects/contracts/project'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'projects.read')
  if (auth.response) return auth.response
  const id = (await params).id
  if (!auth.access.allows('projects.read', { projectId: id })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(request, `/api/projects/${encodeURIComponent(id)}`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'projects.update')
  if (auth.response) return auth.response
  const id = (await params).id
  if (!auth.access.allows('projects.update', { projectId: id })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  const input = createProjectSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return await proxyBackendRequest(request, `/api/projects/${encodeURIComponent(id)}`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'projects.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  if (!auth.access.allows('projects.delete', { projectId: id })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(request, `/api/projects/${encodeURIComponent(id)}`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
