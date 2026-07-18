import { Readable } from 'node:stream'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getDocumentService } from '@/features/documents/application/document.service'
import {
  contentDisposition,
  documentApiError,
} from '@/features/documents/application/http'
import { authorizeApiRequest } from '@/lib/auth/authorization'
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
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const { id } = await context.params
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)

  try {
    const download = await getDocumentService().download(
      id,
      query.data.version,
      { id: auth.user.id, role: auth.user.role },
      auth.requestId,
    )
    return new Response(Readable.toWeb(download.stream) as ReadableStream, {
      headers: {
        'cache-control': 'private, no-store',
        'content-disposition': contentDisposition(download.filename),
        'content-length': download.sizeBytes.toString(),
        'content-type': download.mimeType,
        etag: `"sha256-${download.sha256}"`,
        'x-content-type-options': 'nosniff',
        'x-request-id': auth.requestId,
      },
    })
  } catch (error) {
    return documentApiError(error)
  }
}

