import type { NextRequest } from 'next/server'
import { changeDocumentStatusSchema } from '@/features/documents/contracts/document'
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

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const { id } = await context.params
  try {
    return apiData(
      await getDocumentService().get(id, {
        id: auth.user.id,
        role: auth.user.role,
      }),
    )
  } catch (error) {
    return documentApiError(error)
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const { id } = await context.params

  try {
    const input = changeDocumentStatusSchema.safeParse(await parseJsonRequest(request))
    if (!input.success) return apiValidationError(input.error)
    return apiData(
      await getDocumentService().changeStatus(
        id,
        input.data,
        { id: auth.user.id, role: auth.user.role },
        auth.requestId,
      ),
    )
  } catch (error) {
    return documentApiError(error)
  }
}

