import type { NextRequest } from 'next/server'
import { changeDocumentStatusSchema } from '@/features/documents/contracts/document'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyDocumentRequest } from '@/lib/backend/documents'
import { apiError, apiValidationError } from '@/lib/http/api-response'

interface RouteContext {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request, 'documents.read')
  if (auth.response) return auth.response
  const { id } = await context.params
  return proxyDocumentRequest(request, `/api/documents/${encodeURIComponent(id)}`, auth.user, auth.requestId)
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request, 'documents.update')
  if (auth.response) return auth.response
  const { id } = await context.params

  let payload: unknown
  try {
    payload = await request.clone().json()
  } catch {
    return apiError('INVALID_METADATA', 'Тело запроса должно содержать корректный JSON', 422)
  }
  const input = changeDocumentStatusSchema.safeParse(payload)
  if (!input.success) return apiValidationError(input.error)
  return proxyDocumentRequest(request, `/api/documents/${encodeURIComponent(id)}`, auth.user, auth.requestId)
}
