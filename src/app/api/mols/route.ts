import type { NextRequest } from 'next/server'
import { createMolSchema } from '@/features/assets/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/bridge'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiValidationError } from '@/lib/http/api-response'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'mols.read')
  if (auth.response) return auth.response
  try {
    return await proxyBackendRequest(request, '/api/mols', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'mols.create')
  if (auth.response) return auth.response

  const input = createMolSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return await proxyBackendRequest(request, '/api/mols', auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
