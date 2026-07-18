import type { NextRequest } from 'next/server'
import { ProjectService, ProjectServiceError } from '@/features/projects/application/project.service'
import { createProjectSchema } from '@/features/projects/contracts/project'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'projects.read')
  if (auth.response) return auth.response
  const id = (await params).id
  if (!auth.access.allows('projects.read', { projectId: id })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  const project = await ProjectService.getForApi(id, auth.access)
  return project ? apiData(project) : apiError('PROJECT_NOT_FOUND', 'Проект не найден', 404)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'projects.update')
  if (auth.response) return auth.response
  const id = (await params).id
  if (!auth.access.allows('projects.update', { projectId: id })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  const input = createProjectSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await ProjectService.update(id, input.data, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof ProjectServiceError) return apiError(error.code, 'Проект не найден', 404)
    throw error
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
    return apiData(await ProjectService.delete(id, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof ProjectServiceError) return apiError(error.code, 'Проект не найден', 404)
    throw error
  }
}
