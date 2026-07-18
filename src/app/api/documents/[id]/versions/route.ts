import type { NextRequest } from 'next/server'
import { addDocumentVersionMetadataSchema } from '@/features/documents/contracts/document'
import { getDocumentService } from '@/features/documents/application/document.service'
import {
  documentApiError,
  parseUploadMetadata,
  requestUploadStream,
} from '@/features/documents/application/http'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

interface RouteContext {
  params: Promise<{ id: string }>
}

export const runtime = 'nodejs'

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const { id } = await context.params

  try {
    const metadata = parseUploadMetadata(request, addDocumentVersionMetadataSchema)
    const upload = requestUploadStream(request)
    return apiData(
      await getDocumentService().addVersion(
        id,
        metadata,
        { ...upload, filename: metadata.filename },
        { id: auth.user.id, role: auth.user.role },
        auth.requestId,
      ),
      { status: 201 },
    )
  } catch (error) {
    return documentApiError(error)
  }
}

