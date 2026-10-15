import type { NextRequest } from 'next/server'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { updateTaskSchema } from '@/features/projects/contracts/task'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { taskTarget } from '@/lib/auth/resource-scopes'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'tasks.update')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await taskTarget(id)
  if (target && !auth.access.allows('tasks.update', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  const input = updateTaskSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return await proxyBackendRequest(request, `/api/tasks/${encodeURIComponent(id)}`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'tasks.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await taskTarget(id)
  if (target && !auth.access.allows('tasks.delete', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(request, `/api/tasks/${encodeURIComponent(id)}`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
