import type { NextRequest } from 'next/server'
import { WorkforceService, WorkforceServiceError } from '@/features/employees/application/workforce.service'
import { createVacationSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { employeeTarget, vacationTarget } from '@/lib/auth/resource-scopes'

const mapError = (error: WorkforceServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Отпуск не найден', 404)
  : apiError(error.code, 'Некорректные даты отпуска', 422)

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'vacations.update')
  if (auth.response) return auth.response
  const input = createVacationSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  const id = (await params).id
  const [currentTarget, nextTarget] = await Promise.all([
    vacationTarget(id),
    employeeTarget(input.data.employeeId),
  ])
  const departmentIds = [
    ...(currentTarget?.departmentId ? [currentTarget.departmentId] : []),
    ...(nextTarget?.departmentId ? [nextTarget.departmentId] : []),
  ]
  if (currentTarget && !auth.access.allows('vacations.update', {
    employeeId: currentTarget.employeeId,
    departmentIds,
  })) return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  try {
    return apiData(await WorkforceService.saveVacation(id, input.data, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof WorkforceServiceError) return mapError(error)
    throw error
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, 'vacations.delete')
  if (auth.response) return auth.response
  const id = (await params).id
  const target = await vacationTarget(id)
  if (target && !auth.access.allows('vacations.delete', target)) {
    return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  }
  try {
    return apiData(await WorkforceService.deleteVacation(id, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof WorkforceServiceError) return mapError(error)
    throw error
  }
}
