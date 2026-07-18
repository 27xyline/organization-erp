import { apiError } from '@/lib/http/api-response'
import { TimekeepingError } from './timekeeping.service'

export function timekeepingApiError(error: unknown) {
  if (!(error instanceof TimekeepingError)) throw error
  if (error.code === 'NOT_FOUND') return apiError('NOT_FOUND', 'Запись табеля не найдена', 404)
  if (error.code === 'FORBIDDEN') return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  if (error.code === 'DAILY_HOURS_EXCEEDED') {
    return apiError('DAILY_HOURS_EXCEEDED', 'За один день нельзя указать больше 24 часов', 409)
  }
  return apiError('INVALID_REFERENCE', 'Сотрудник, проект или задача не найдены', 400)
}
