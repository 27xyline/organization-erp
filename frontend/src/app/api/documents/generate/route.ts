import type { NextRequest } from 'next/server'
import { generateDocumentSchema } from '@/features/documents/contracts/document'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyDocumentRequest } from '@/lib/backend/documents'
import { apiValidationError } from '@/lib/http/api-response'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'documents.create')
  if (auth.response) return auth.response

  const input = generateDocumentSchema.safeParse(await request.clone().json())
  if (!input.success) return apiValidationError(input.error)
  return proxyDocumentRequest(request, '/api/documents/generate', auth.user, auth.requestId)
}
