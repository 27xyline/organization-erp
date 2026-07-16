import type { NextRequest } from 'next/server'
import { WorkforceService, WorkforceServiceError } from '@/features/employees/workforce.service'
import { createVacationSchema } from '@/lib/validations'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

const mapError = (error: WorkforceServiceError) => error.code === 'NOT_FOUND'
  ? apiError(error.code, 'Отпуск не найден', 404)
  : apiError(error.code, 'Некорректные даты отпуска', 422)

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  const input = createVacationSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)
  try {
    return apiData(await WorkforceService.saveVacation((await params).id, input.data, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof WorkforceServiceError) return mapError(error)
    throw error
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeApiRequest(request, ['ADMIN', 'EDITOR'])
  if (auth.response) return auth.response
  try {
    return apiData(await WorkforceService.deleteVacation((await params).id, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof WorkforceServiceError) return mapError(error)
    throw error
  }
}
