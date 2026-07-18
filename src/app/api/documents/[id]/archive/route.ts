import type { NextRequest } from 'next/server'
import { archiveDocumentSchema } from '@/features/documents/contracts/document'
import { getDocumentService } from '@/features/documents/application/document.service'
import {
  documentApiError,
  parseJsonRequest,
} from '@/features/documents/application/http'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const { id } = await context.params

  try {
    const input = archiveDocumentSchema.safeParse(await parseJsonRequest(request))
    if (!input.success) return apiValidationError(input.error)
    return apiData(
      await getDocumentService().archive(
        id,
        input.data.lockVersion,
        { id: auth.user.id, role: auth.user.role },
        auth.requestId,
      ),
    )
  } catch (error) {
    return documentApiError(error)
  }
}

