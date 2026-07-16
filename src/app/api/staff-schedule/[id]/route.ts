import type { NextRequest } from 'next/server'
import { WorkforceService, WorkforceServiceError } from '@/features/employees/application/workforce.service'
import { createStaffScheduleSchema } from '@/features/employees/contracts/schemas'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

const mapError = (error: WorkforceServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Должность не найдена', 404)
  : apiError(error.code, error.code === 'POSITION_IN_USE'
    ? 'Нельзя удалить должность с назначенными сотрудниками'
    : 'Нельзя уменьшить количество ставок ниже занятого значения', 409)

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = createStaffScheduleSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await WorkforceService.updatePosition((await params).id, input.data, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof WorkforceServiceError) return mapError(error)
    throw error
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  try {
    return apiData(await WorkforceService.deletePosition((await params).id, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof WorkforceServiceError) return mapError(error)
    throw error
  }
}
