import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { createProjectSchema } from '@/features/projects/contracts/project'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'projects.read')
  if (auth.response) return auth.response
  const raw = Object.fromEntries(request.nextUrl.searchParams)
  if (raw.limit && !raw.pageSize) raw.pageSize = raw.limit
  const query = querySchema.safeParse(raw)
  if (!query.success) return apiValidationError(query.error)
  const params = new URLSearchParams({
    page: String(query.data.page),
    pageSize: String(query.data.pageSize),
    ...(query.data.status ? { status: query.data.status } : {}),
  })
  try {
    return await proxyBackendRequest(request, `/api/projects?${params.toString()}`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'projects.create')
  if (auth.response) return auth.response
  const input = createProjectSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return await proxyBackendRequest(request, '/api/projects', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
