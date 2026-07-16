import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'
import { updateUserSchema } from '@/features/users/contracts/schemas'
import { UserService, UserServiceError } from '@/features/users/application/user.service'

const userErrorMessages: Record<string, [string, number]> = {
  USER_NOT_FOUND: ['Пользователь не найден', 404],
  CANNOT_DEACTIVATE_SELF: ['Нельзя отключить собственную учётную запись', 409],
  LAST_ADMIN_REQUIRED: ['В системе должен остаться хотя бы один активный администратор', 409],
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeApiRequest(request, ['ADMIN'])
  if (auth.response) return auth.response

  const input = updateUserSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)

  try {
    return apiData(await UserService.update((await params).id, input.data, auth.user.id, auth.requestId))
  } catch (error) {
    if (error instanceof UserServiceError && userErrorMessages[error.code]) {
      const [message, status] = userErrorMessages[error.code]
      return apiError(error.code, message, status)
    }
    throw error
  }
}
