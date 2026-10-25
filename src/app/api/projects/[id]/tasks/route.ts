import type { NextRequest } from 'next/server'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { createTaskSchema } from '@/features/projects/contracts/task'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'tasks.read')
  if (auth.response) return auth.response
  const projectId = (await params).id
  if (!auth.access.allows('tasks.read', { projectId })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(request, `/api/projects/${encodeURIComponent(projectId)}/tasks`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'tasks.create')
  if (auth.response) return auth.response
  const projectId = (await params).id
  if (!auth.access.allows('tasks.create', { projectId })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  const input = createTaskSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return await proxyBackendRequest(request, `/api/projects/${encodeURIComponent(projectId)}/tasks`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
