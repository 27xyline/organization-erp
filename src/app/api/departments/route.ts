import type { NextRequest } from 'next/server'
import { departmentsQuerySchema, createDepartmentSchema } from '@/features/departments/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'departments.read')
  if (auth.response) return auth.response

  const query = departmentsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)

  try {
    const target = `/api/departments${request.nextUrl.search ? `?${request.nextUrl.searchParams.toString()}` : ''}`
    return await proxyBackendRequest(request, target, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'departments.create')
  if (auth.response) return auth.response

  const input = createDepartmentSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)

  try {
    return await proxyBackendRequest(request, '/api/departments', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
