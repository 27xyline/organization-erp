import type { NextRequest } from 'next/server'
import { TaskService, TaskServiceError } from '@/features/projects/application/task.service'
import { updateTaskSchema } from '@/features/projects/contracts/task'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { taskTarget } from '@/lib/auth/resource-scopes'

const mapError = (error: TaskServiceError) => apiError(
  error.code,
  error.message,
  error.code === 'TASK_NOT_FOUND' ? 404 : 422,
)

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'tasks.update')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await taskTarget(id)
  if (target && !auth.access.allows('tasks.update', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  const input = updateTaskSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await TaskService.update(id, input.data))
  } catch (error) {
    if (error instanceof TaskServiceError) return mapError(error)
    throw error
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
    return apiData(await TaskService.delete(id))
  } catch (error) {
    if (error instanceof TaskServiceError) return mapError(error)
    throw error
  }
}
