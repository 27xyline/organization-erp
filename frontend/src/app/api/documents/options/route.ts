import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyDocumentRequest } from '@/lib/backend/documents'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'documents.create')
  if (auth.response) return auth.response
  return proxyDocumentRequest(request, '/api/documents/options', auth.user, auth.requestId)
}
