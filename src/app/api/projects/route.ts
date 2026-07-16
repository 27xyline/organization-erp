import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { ProjectService, ProjectServiceError } from '@/features/projects/application/project.service'
import { createProjectSchema } from '@/features/projects/contracts/project'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiList, apiValidationError } from '@/lib/http/api-response'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const raw = Object.fromEntries(request.nextUrl.searchParams)
  if (raw.limit && !raw.pageSize) raw.pageSize = raw.limit
  const query = querySchema.safeParse(raw)
  if (!query.success) return apiValidationError(query.error)
  const result = await ProjectService.list(query.data)
  return apiList(result.projects, { ...query.data, total: result.total })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = createProjectSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await ProjectService.create(input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    if (error instanceof ProjectServiceError) return apiError(error.code, 'Проект с таким кодом уже существует', 409)
    throw error
  }
}
