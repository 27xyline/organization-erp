import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { PersonnelActionService } from '@/features/employees/application/personnel-action.service'
import { getPersonnelActionRouteErrorMeta } from '@/features/employees/application/error-mapping'
import { createPersonnelActionSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiList, apiValidationError } from '@/lib/http/api-response'
import {
  departmentForPosition,
  employeeTarget,
} from '@/lib/auth/resource-scopes'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'personnelActions.read')
  if (auth.response) return auth.response
  const raw = Object.fromEntries(request.nextUrl.searchParams)
  if (raw.limit && !raw.pageSize) raw.pageSize = raw.limit
  const query = querySchema.safeParse(raw)
  if (!query.success) return apiValidationError(query.error)
  const result = await PersonnelActionService.list(query.data, auth.access)
  return apiList(result.actions, { ...query.data, total: result.total })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'personnelActions.create')
  if (auth.response) return auth.response
  const input = createPersonnelActionSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const employeeId = input.data.employeeId || input.data.employeeData?.id
  const [currentTarget, nextDepartmentId] = await Promise.all([
    employeeId ? employeeTarget(employeeId) : Promise.resolve(null),
    departmentForPosition(input.data.staffScheduleId || input.data.employeeData?.staffScheduleId),
  ])
  const target = currentTarget
    ? {
        employeeId: currentTarget.employeeId,
        departmentIds: [
          ...(currentTarget.departmentId ? [currentTarget.departmentId] : []),
          ...(nextDepartmentId ? [nextDepartmentId] : []),
        ],
      }
    : nextDepartmentId
      ? { departmentId: nextDepartmentId }
      : null
  if (target && !auth.access.allows('personnelActions.create', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return apiData(await PersonnelActionService.createAction(input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    const mapped = getPersonnelActionRouteErrorMeta(error)
    if (mapped) return apiError('PERSONNEL_ACTION_INVALID', mapped.error, mapped.status)
    throw error
  }
}
