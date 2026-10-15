import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { taskTarget } from '@/lib/auth/resource-scopes'
import { apiError, apiValidationError } from '@/lib/http/api-response'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { createTaskCommentSchema } from '@/features/projects/contracts/task'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'tasks.update')
  if (auth.response) return auth.response
  const input = createTaskCommentSchema.safeParse(await request.clone().json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  const { id } = await context.params
  const target = await taskTarget(id)
  if (!target) return apiError('TASK_NOT_FOUND', 'Задача не найдена', 404)
  if (!auth.access.allows('tasks.update', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return await proxyBackendRequest(request, `/api/tasks/${encodeURIComponent(id)}/comments`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
