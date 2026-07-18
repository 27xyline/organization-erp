import type { NextRequest } from 'next/server'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { apiData, apiError, apiList, apiValidationError } from '@/lib/http/api-response'
import { createUserSchema, usersQuerySchema } from '@/features/users/contracts/schemas'
import { UserService, UserServiceError } from '@/features/users/application/user.service'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.read')
  if (auth.response) return auth.response

  const query = usersQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return apiValidationError(query.error)

  const result = await UserService.list(query.data)
  return apiList(result.users, { ...query.data, total: result.total })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeApiRequest(request, 'access.users.create')
  if (auth.response) return auth.response

  const input = createUserSchema.safeParse(await request.json())
  if (!input.success) return apiValidationError(input.error)

  try {
    return apiData(await UserService.create(input.data, auth.user.id, auth.requestId), { status: 201 })
  } catch (error) {
    if (error instanceof UserServiceError) {
      if (error.code === 'USERNAME_EXISTS') {
        return apiError('USERNAME_EXISTS', 'Пользователь с таким логином уже существует', 409)
      }
      if (error.code === 'EMPLOYEE_ALREADY_LINKED') {
        return apiError(error.code, 'Кадровая карточка уже связана с другим пользователем', 409)
      }
      if (['INVALID_SCOPE_ASSIGNMENT', 'INVALID_SCOPE_REFERENCE', 'EMPLOYEE_LINK_REQUIRED'].includes(error.code)) {
        return apiError(error.code, 'Проверьте роли, области доступа и связь с сотрудником', 422)
      }
    }
    throw error
  }
}
