import type { NextRequest } from 'next/server'
import { CatalogService, CatalogServiceError } from '@/features/assets/application/catalog.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { createMolSchema } from '@/features/assets/contracts/schemas'
import {
  DepartmentReferenceError,
  getDepartmentReferenceErrorMeta,
} from '@/lib/organization/department-reference'

const catalogError = (error: CatalogServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'МОЛ не найден', 404)
  : error.code === 'CODE_EXISTS'
    ? apiError(error.code, 'МОЛ с таким кодом уже существует', 409)
    : apiError(error.code, 'МОЛ используется в остатках или истории имущества', 409)

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const mol = await CatalogService.getMol((await params).id)
  return mol ? apiData(mol) : apiError('NOT_FOUND', 'МОЛ не найден', 404)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = createMolSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await CatalogService.updateMol((await params).id, input.data, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof CatalogServiceError) return catalogError(error)
    if (error instanceof DepartmentReferenceError) {
      const meta = getDepartmentReferenceErrorMeta(error.code)
      return apiError(error.code, meta.message, meta.status)
    }
    throw error
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  try {
    return apiData(await CatalogService.deleteMol((await params).id, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof CatalogServiceError) return catalogError(error)
    throw error
  }
}
