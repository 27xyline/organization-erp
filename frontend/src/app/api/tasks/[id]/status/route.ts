import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyBackendRequest } from '@/lib/backend/transport'
import { backendUnavailableResponse } from '@/lib/backend/client'
import { apiError, apiValidationError } from '@/lib/http/api-response'
const schema = z.object({ status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']) }).strict()
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'tasks.read')
  if (auth.response) return auth.response
  let body: unknown
  try { body = await request.clone().json() }
  catch { return apiError('INVALID_JSON', 'Некорректный JSON', 400) }
  const input = schema.safeParse(body)
  if (!input.success) return apiValidationError(input.error)
  const { id } = await params
  try { return await proxyBackendRequest(request, `/api/tasks/${encodeURIComponent(id)}/status`, auth.user, auth.requestId) }
  catch (error) { return backendUnavailableResponse(error, auth.requestId) }
}
