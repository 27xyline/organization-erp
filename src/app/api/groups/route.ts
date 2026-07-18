import type { NextRequest } from 'next/server'
import { CatalogService, CatalogServiceError } from '@/features/assets/application/catalog.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { createGroupSchema } from '@/features/assets/contracts/schemas'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assetGroups.read')
  if (auth.response) return auth.response
  return apiData(await CatalogService.listGroups())
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'assetGroups.create')
  if (auth.response) return auth.response
  const input = createGroupSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await CatalogService.createGroup(input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    if (error instanceof CatalogServiceError && error.code === 'CODE_EXISTS') {
      return apiError(error.code, 'Группа с таким кодом уже существует', 409)
    }
    throw error
  }
}
