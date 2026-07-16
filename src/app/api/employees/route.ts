import { Prisma } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { EmployeeService } from '@/lib/services/employee.service'
import { getEmployeeRouteErrorMeta } from '@/lib/services/hr-domain'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiList, apiValidationError } from '@/lib/http/api-response'
import { createEmployeeSchema } from '@/lib/validations'

const querySchema = z.object({
  scope: z.enum(['active', 'archive', 'expired', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

function mapEmployeeError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return apiError('EMPLOYEE_CODE_EXISTS', 'Сотрудник с таким табельным номером уже существует', 409)
  }
  const routeError = getEmployeeRouteErrorMeta(error)
  return routeError ? apiError('EMPLOYEE_DOMAIN_ERROR', routeError.error, routeError.status) : null
}

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response
  const raw = Object.fromEntries(request.nextUrl.searchParams)
  if (raw.limit && !raw.pageSize) raw.pageSize = raw.limit
  const query = querySchema.safeParse(raw)
  if (!query.success) return apiValidationError(query.error)
  const result = await EmployeeService.list(query.data)
  return apiList(result.employees, { ...query.data, total: result.total })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = createEmployeeSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await EmployeeService.createEmployee(input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    const mapped = mapEmployeeError(error)
    if (mapped) return mapped
    throw error
  }
}
