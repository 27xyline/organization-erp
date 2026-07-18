import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { taskTarget } from '@/lib/auth/resource-scopes'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { TaskService, TaskServiceError } from '@/features/projects/application/task.service'
import { createTaskCommentSchema } from '@/features/projects/contracts/task'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, 'tasks.update')
  if (auth.response) return auth.response
  const input = createTaskCommentSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return apiValidationError(input.error)
  const { id } = await context.params
  const target = await taskTarget(id)
  if (!target) return apiError('TASK_NOT_FOUND', 'Задача не найдена', 404)
  if (!auth.access.allows('tasks.update', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return apiData(await TaskService.addComment(
      id,
      auth.user.id,
      input.data.body,
      auth.requestId,
    ), { status: 201 })
  } catch (error) {
    if (error instanceof TaskServiceError) {
      return apiError(error.code, error.message, error.code === 'TASK_NOT_FOUND' ? 404 : 422)
    }
    throw error
  }
}
