import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyDocumentStream } from '@/lib/backend/documents'

interface RouteContext {
  params: Promise<{ id: string }>
}

export const runtime = 'nodejs'

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request, 'documents.update')
  if (auth.response) return auth.response
  const { id } = await context.params
  return proxyDocumentStream(
    request,
    `/api/documents/${encodeURIComponent(id)}/versions`,
    auth.user,
    auth.requestId,
  )
}
