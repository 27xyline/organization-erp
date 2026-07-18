import type { NextRequest } from 'next/server'
import { CatalogService, CatalogServiceError } from '@/features/assets/application/catalog.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { createGroupSchema } from '@/features/assets/contracts/schemas'

const catalogError = (error: CatalogServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Группа не найдена', 404)
  : error.code === 'CODE_EXISTS'
    ? apiError(error.code, 'Группа с таким кодом уже существует', 409)
    : apiError(error.code, 'Группа используется объектами имущества', 409)

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'assetGroups.read')
  if (auth.response) return auth.response
  const group = await CatalogService.getGroup((await params).id)
  return group ? apiData(group) : apiError('NOT_FOUND', 'Группа не найдена', 404)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'assetGroups.update')
  if (auth.response) return auth.response
  const input = createGroupSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await CatalogService.updateGroup((await params).id, input.data, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof CatalogServiceError) return catalogError(error)
    throw error
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'assetGroups.delete')
  if (auth.response) return auth.response
  try {
    return apiData(await CatalogService.deleteGroup((await params).id, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof CatalogServiceError) return catalogError(error)
    throw error
  }
}
