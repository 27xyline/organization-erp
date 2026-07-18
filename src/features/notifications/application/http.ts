import { apiError } from '@/lib/http/api-response'
import { NotificationServiceError } from './notification.service'

export function notificationApiError(error: unknown) {
  if (error instanceof NotificationServiceError && error.code === 'NOT_FOUND') {
    return apiError('NOT_FOUND', 'Уведомление не найдено', 404)
  }
  throw error
}
