import type { NextRequest } from 'next/server'
import { WorkforceService, WorkforceServiceError } from '@/features/employees/application/workforce.service'
import { createStaffScheduleSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import {
  DepartmentReferenceError,
  getDepartmentReferenceErrorMeta,
} from '@/lib/organization/department-reference'
import { departmentForReference, staffPositionTarget } from '@/lib/auth/resource-scopes'

const mapError = (error: WorkforceServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Должность не найдена', 404)
  : error.code === 'POSITION_DEPARTMENT_CHANGE_IN_USE'
    ? apiError(error.code, 'Нельзя изменить подразделение должности с назначенными сотрудниками', 409)
  : apiError(error.code, error.code === 'POSITION_IN_USE'
    ? 'Нельзя удалить должность с назначенными сотрудниками'
    : 'Нельзя уменьшить количество ставок ниже занятого значения', 409)

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'staffSchedule.update')
  if (auth.response) return auth.response
  const input = createStaffScheduleSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id
  const [currentTarget, nextDepartmentId] = await Promise.all([
    staffPositionTarget(id),
    departmentForReference(input.data),
  ])
  if (currentTarget && !auth.access.allows('staffSchedule.update', {
    departmentIds: [
      ...(currentTarget.departmentId ? [currentTarget.departmentId] : []),
      ...(nextDepartmentId ? [nextDepartmentId] : []),
    ],
  })) return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  try {
    return apiData(await WorkforceService.updatePosition(id, input.data, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof WorkforceServiceError) return mapError(error)
    if (error instanceof DepartmentReferenceError) {
      const meta = getDepartmentReferenceErrorMeta(error.code)
      return apiError(error.code, meta.message, meta.status)
    }
    throw error
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'staffSchedule.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await staffPositionTarget(id)
  if (target && !auth.access.allows('staffSchedule.delete', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return apiData(await WorkforceService.deletePosition(id, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof WorkforceServiceError) return mapError(error)
    throw error
  }
}
