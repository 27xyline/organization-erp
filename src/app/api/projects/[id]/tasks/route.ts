import type { NextRequest } from 'next/server'
import { TaskService, TaskServiceError } from '@/features/projects/application/task.service'
import { createTaskSchema } from '@/features/projects/contracts/task'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'tasks.read')
  if (auth.response) return auth.response
  const projectId = (await params).id
  if (!auth.access.allows('tasks.read', { projectId })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  return apiData(await TaskService.list(projectId))
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'tasks.create')
  if (auth.response) return auth.response
  const projectId = (await params).id
  if (!auth.access.allows('tasks.create', { projectId })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  const input = createTaskSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await TaskService.create(projectId, input.data), { status: 201 })
  } catch (error) {
    if (error instanceof TaskServiceError) return apiError(error.code, error.message, 422)
    throw error
  }
}
