import type { NextRequest } from 'next/server'
import { documentsQuerySchema } from '@/features/documents/contracts/document'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyDocumentRequest, proxyDocumentStream } from '@/lib/backend/documents'
import { apiValidationError } from '@/lib/http/api-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'documents.read')
  if (auth.response) return auth.response

  const query = documentsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)

  const search = request.nextUrl.search
  return proxyDocumentRequest(request, `/api/documents${search}`, auth.user, auth.requestId)
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'documents.create')
  if (auth.response) return auth.response
  return proxyDocumentStream(request, '/api/documents', auth.user, auth.requestId)
}
