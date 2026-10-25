import type { NextRequest } from 'next/server'
import { archiveDocumentSchema } from '@/features/documents/contracts/document'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyDocumentRequest } from '@/lib/backend/documents'
import { apiError, apiValidationError } from '@/lib/http/api-response'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request, 'documents.archive')
  if (auth.response) return auth.response
  const { id } = await context.params

  let payload: unknown
  try {
    payload = await request.clone().json()
  } catch {
    return apiError('INVALID_METADATA', 'Тело запроса должно содержать корректный JSON', 422)
  }
  const input = archiveDocumentSchema.safeParse(payload)
  if (!input.success) return apiValidationError(input.error)
  return proxyDocumentRequest(
    request,
    `/api/documents/${encodeURIComponent(id)}/archive`,
    auth.user,
    auth.requestId,
  )
}
