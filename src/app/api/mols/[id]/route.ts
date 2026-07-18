import type { NextRequest } from 'next/server'
import { CatalogService, CatalogServiceError } from '@/features/assets/application/catalog.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { createMolSchema } from '@/features/assets/contracts/schemas'
import {
  DepartmentReferenceError,
  getDepartmentReferenceErrorMeta,
} from '@/lib/organization/department-reference'
import { departmentForReference, molTarget } from '@/lib/auth/resource-scopes'

const catalogError = (error: CatalogServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'МОЛ не найден', 404)
  : error.code === 'CODE_EXISTS'
    ? apiError(error.code, 'МОЛ с таким кодом уже существует', 409)
    : apiError(error.code, 'МОЛ используется в остатках или истории имущества', 409)

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'mols.read')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await molTarget(id)
  if (target && !auth.access.allows('mols.read', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  const mol = await CatalogService.getMol(id, auth.access)
  return mol ? apiData(mol) : apiError('NOT_FOUND', 'МОЛ не найден', 404)
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'mols.update')
  if (auth.response) return auth.response
  const input = createMolSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id
  const [currentTarget, nextDepartmentId] = await Promise.all([
    molTarget(id),
    departmentForReference(input.data),
  ])
  if (currentTarget && !auth.access.allows('mols.update', {
    departmentIds: [
      ...(currentTarget.departmentId ? [currentTarget.departmentId] : []),
      ...(nextDepartmentId ? [nextDepartmentId] : []),
    ],
  })) return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  try {
    return apiData(await CatalogService.updateMol(id, input.data, auth.user.id, auth.requestId))
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
  const auth = await authorizeApiRequest(request, 'mols.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await molTarget(id)
  if (target && !auth.access.allows('mols.delete', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return apiData(await CatalogService.deleteMol(id, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof CatalogServiceError) return catalogError(error)
    throw error
  }
}
