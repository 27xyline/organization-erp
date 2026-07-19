import type { NextRequest } from 'next/server'
import { getDocumentService } from '@/features/documents/application/document.service'
import { documentApiError } from '@/features/documents/application/http'
import { generateDocumentSchema } from '@/features/documents/contracts/document'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiValidationError } from '@/lib/http/api-response'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'documents.create')
  if (auth.response) return auth.response

  const input = generateDocumentSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)

  try {
    return apiData(
      await getDocumentService().createGenerated(
        input.data,
        { id: auth.user.id, access: auth.access },
        auth.requestId,
      ),
      { status: 201 },
    )
  } catch (error) {
    return documentApiError(error)
  }
}
