import type { NextRequest } from 'next/server'
import { changePasswordSchema } from '@/features/users/contracts/schemas'
import { UserService, UserServiceError } from '@/features/users/application/user.service'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiValidationError } from '@/lib/http/api-response'

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response

  const input = changePasswordSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)

  try {
    await UserService.changePassword(auth.user.id, input.data, auth.requestId)
    return apiData({ success: true })
  } catch (error) {
    if (error instanceof UserServiceError && error.code === 'INVALID_CURRENT_PASSWORD') {
      return apiError('INVALID_CURRENT_PASSWORD', 'Текущий пароль указан неверно', 422)
    }
    throw error
  }
}
