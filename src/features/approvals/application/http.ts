import { apiError } from '@/lib/http/api-response'
import { ApprovalServiceError } from './approval.service'

const errors = {
  NOT_FOUND: ['APPROVAL_NOT_FOUND', 'Согласование не найдено', 404],
  FORBIDDEN: ['FORBIDDEN', 'Недостаточно прав для этого согласования', 403],
  INVALID_STATE: ['INVALID_APPROVAL_STATE', 'Согласование уже завершено или изменилось', 409],
  INVALID_APPROVER: ['INVALID_APPROVER', 'Один из согласующих недоступен', 422],
  REFERENCE_NOT_FOUND: ['REFERENCE_NOT_FOUND', 'Связанный объект не найден', 422],
} as const

export function approvalApiError(error: unknown) {
  if (error instanceof ApprovalServiceError) {
    const [code, message, status] = errors[error.code]
    return apiError(code, message, status)
  }
  throw error
}
