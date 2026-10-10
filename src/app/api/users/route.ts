import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { createUserSchema, usersQuerySchema } from '@/features/users/contracts/schemas'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.read')
  if (auth.response) return auth.response

  const query = usersQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)

  const target = `/api/users?${request.nextUrl.searchParams.toString()}`
  try {
    return await proxyBackendRequest(request, target, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.create')
  if (auth.response) return auth.response

  const input = createUserSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return await proxyBackendRequest(request, '/api/users', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
