import type { NextRequest } from 'next/server'
import {
  createDocumentMetadataSchema,
  documentsQuerySchema,
} from '@/features/documents/contracts/document'
import { getDocumentService } from '@/features/documents/application/document.service'
import {
  documentApiError,
  parseUploadMetadata,
  requestUploadStream,
} from '@/features/documents/application/http'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiList, apiValidationError } from '@/lib/http/api-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'documents.read')
  if (auth.response) return auth.response

  const query = documentsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  )
  if (!query.success) return apiValidationError(query.error)

  try {
    const result = await getDocumentService().list(query.data, {
      id: auth.user.id,
      access: auth.access,
    })
    return apiList(result.documents, {
      page: query.data.page,
      pageSize: query.data.pageSize,
      total: result.total,
    })
  } catch (error) {
    return documentApiError(error)
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'documents.create')
  if (auth.response) return auth.response

  try {
    const metadata = parseUploadMetadata(request, createDocumentMetadataSchema)
    const upload = requestUploadStream(request)
    return apiData(
      await getDocumentService().create(
        metadata,
        {
          ...upload,
          filename: metadata.filename,
        },
        { id: auth.user.id, access: auth.access },
        auth.requestId,
      ),
      { status: 201 },
    )
  } catch (error) {
    return documentApiError(error)
  }
}
