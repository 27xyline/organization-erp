import type { NextRequest } from 'next/server'
import { ProjectService, ProjectServiceError } from '@/features/projects/project.service'
import { createProjectSchema } from '@/lib/validations'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const project = await ProjectService.getForApi((await params).id)
  return project ? apiData(project) : apiError('PROJECT_NOT_FOUND', 'Проект не найден', 404)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = createProjectSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await ProjectService.update((await params).id, input.data, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof ProjectServiceError) return apiError(error.code, 'Проект не найден', 404)
    throw error
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  try {
    return apiData(await ProjectService.delete((await params).id, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof ProjectServiceError) return apiError(error.code, 'Проект не найден', 404)
    throw error
  }
}
