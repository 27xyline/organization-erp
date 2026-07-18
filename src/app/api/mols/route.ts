import type { NextRequest } from 'next/server'
import { CatalogService, CatalogServiceError } from '@/features/assets/application/catalog.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { createMolSchema } from '@/features/assets/contracts/schemas'
import {
  DepartmentReferenceError,
  getDepartmentReferenceErrorMeta,
} from '@/lib/organization/department-reference'
import { departmentForReference } from '@/lib/auth/resource-scopes'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'mols.read')
  if (auth.response) return auth.response
  return apiData(await CatalogService.listMols(auth.access))
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'mols.create')
  if (auth.response) return auth.response
  const input = createMolSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const departmentId = await departmentForReference(input.data)
  if (departmentId && !auth.access.allows('mols.create', { departmentId })) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return apiData(await CatalogService.createMol(input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    if (error instanceof CatalogServiceError) {
      if (error.code === 'CODE_EXISTS') {
        return apiError(error.code, 'МОЛ с таким кодом уже существует', 409)
      }
    }
    if (error instanceof DepartmentReferenceError) {
      const meta = getDepartmentReferenceErrorMeta(error.code)
      return apiError(error.code, meta.message, meta.status)
    }
    throw error
  }
}
