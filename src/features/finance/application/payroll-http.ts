import { apiError } from '@/lib/http/api-response'
import { PayrollError } from './payroll.service'

export function payrollApiError(error: unknown) {
  if (!(error instanceof PayrollError)) throw error
  if (error.code === 'ADJUSTMENT_NOT_FOUND') {
    return apiError(error.code, 'Выплата не найдена', 404)
  }
  return apiError(error.code, 'Месяц закрыт для изменений', 409)
}
