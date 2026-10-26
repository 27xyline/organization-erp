import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { proxyDocumentStream } from '@/lib/backend/documents'
import { apiValidationError } from '@/lib/http/api-response'

interface RouteContext {
  params: Promise<{ id: string }>
}

const querySchema = z.object({
  version: z.coerce.number().int().positive().optional(),
})

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request, 'documents.download')
  if (auth.response) return auth.response
  const { id } = await context.params
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)

  const search = request.nextUrl.search
  return proxyDocumentStream(
    request,
    `/api/documents/${encodeURIComponent(id)}/download${search}`,
    auth.user,
    auth.requestId,
  )
}
