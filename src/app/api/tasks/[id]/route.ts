import type { NextRequest } from 'next/server'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { updateTaskSchema } from '@/features/projects/contracts/task'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiValidationError } from '@/lib/http/api-response'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'tasks.update')
  if (auth.response) return auth.response
  const id = (await params).id
  const input = updateTaskSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return await proxyBackendRequest(request, `/api/tasks/${encodeURIComponent(id)}`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'tasks.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  try {
    return await proxyBackendRequest(request, `/api/tasks/${encodeURIComponent(id)}`, auth.user, auth.requestId)
  } catch (error) {
    return backendUnavailableResponse(error, auth.requestId)
  }
}
