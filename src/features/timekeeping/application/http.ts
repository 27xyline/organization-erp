import { apiError } from '@/lib/http/api-response'
import { TimekeepingError } from './timekeeping.service'

export function timekeepingApiError(error: unknown) {
  if (!(error instanceof TimekeepingError)) throw error
  if (error.code === 'NOT_FOUND') return apiError('NOT_FOUND', 'Запись табеля не найдена', 404)
  if (error.code === 'FORBIDDEN') return apiError('FORBIDDEN', 'Недостаточно прав', 403)
  if (error.code === 'TIMESHEET_DECISION_FORBIDDEN') {
    return apiError(error.code, 'Утверждать табель может только руководитель по маршруту согласования', 403)
  }
  if (error.code === 'PERIOD_CLOSED') {
    return apiError(error.code, 'Расчётный месяц закрыт', 409)
  }
  if (error.code === 'TIMESHEET_LOCKED') {
    return apiError(error.code, 'Отправленный или утверждённый табель заблокирован', 409)
  }
  if (error.code === 'TIMESHEET_STATE_INVALID') {
    return apiError(error.code, 'Табель уже обработан или не ожидает решения', 409)
  }
  if (error.code === 'ZERO_HOURS_CONFIRMATION_REQUIRED') {
    return apiError(error.code, 'Подтвердите, что за месяц нет часов', 422)
  }
  if (error.code === 'CORRECTION_REASON_REQUIRED') {
    return apiError(error.code, 'Для изменения утверждённого табеля укажите причину корректировки', 422)
  }
  if (error.code === 'APPROVAL_REASON_REQUIRED') {
    return apiError(error.code, 'Для этого решения необходимо указать причину', 422)
  }
  if (error.code === 'PAYROLL_TIMESHEETS_PENDING') {
    return apiError(error.code, 'Сначала утвердите табели всех сотрудников', 409)
  }
  if (error.code === 'DAILY_HOURS_EXCEEDED') {
    return apiError('DAILY_HOURS_EXCEEDED', 'За один день нельзя указать больше 24 часов', 409)
  }
  return apiError('INVALID_REFERENCE', 'Сотрудник, проект или задача не найдены', 400)
}
