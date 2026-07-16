import type { NextRequest } from 'next/server'
import { TaskService, TaskServiceError } from '@/features/projects/application/task.service'
import { updateTaskSchema } from '@/features/projects/contracts/task'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

const mapError = (error: TaskServiceError) => apiError(
  error.code,
  error.message,
  error.code === 'TASK_NOT_FOUND' ? 404 : 422,
)

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = updateTaskSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await TaskService.update((await params).id, input.data))
  } catch (error) {
    if (error instanceof TaskServiceError) return mapError(error)
    throw error
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  try {
    return apiData(await TaskService.delete((await params).id))
  } catch (error) {
    if (error instanceof TaskServiceError) return mapError(error)
    throw error
  }
}
