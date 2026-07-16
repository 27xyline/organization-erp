import type { NextRequest } from 'next/server'
import { TaskService, TaskServiceError } from '@/features/projects/task.service'
import { createTaskSchema } from '@/lib/schemas/task'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  return apiData(await TaskService.list((await params).id))
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = createTaskSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await TaskService.create((await params).id, input.data), { status: 201 })
  } catch (error) {
    if (error instanceof TaskServiceError) return apiError(error.code, error.message, 422)
    throw error
  }
}
