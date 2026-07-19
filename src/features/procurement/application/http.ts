import { apiError } from '@/lib/http/api-response'
import { ProcurementError } from './procurement.service'

const errors = {
  NOT_FOUND: ['PROCUREMENT_NOT_FOUND', 'Закупка или её этап не найдены', 404],
  INVALID_STATE: ['INVALID_PROCUREMENT_STATE', 'Действие недоступно на текущем этапе закупки', 409],
  REFERENCE_NOT_FOUND: ['REFERENCE_NOT_FOUND', 'Связанный объект не найден', 422],
  BUDGET_EXCEEDED: ['BUDGET_EXCEEDED', 'Сумма договора превышает бюджетный лимит', 409],
  DELIVERY_EXCEEDED: ['DELIVERY_EXCEEDED', 'Количество поставки превышает остаток по заявке', 409],
  ALREADY_CAPITALIZED: ['ALREADY_CAPITALIZED', 'Позиция уже поставлена на учёт', 409],
} as const

export function procurementApiError(error: unknown) {
  if (!(error instanceof ProcurementError)) throw error
  const [code, message, status] = errors[error.code]
  return apiError(code, message, status)
}
