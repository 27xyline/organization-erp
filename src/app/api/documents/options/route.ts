import type { NextRequest } from 'next/server'
import { getDocumentService } from '@/features/documents/application/document.service'
import { documentApiError } from '@/features/documents/application/http'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData } from '@/lib/http/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'documents.create')
  if (auth.response) return auth.response
  try {
    return apiData(
      await getDocumentService().listLinkOptions({ id: auth.user.id, access: auth.access }),
    )
  } catch (error) {
    return documentApiError(error)
  }
}
