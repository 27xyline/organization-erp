import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/prisma'

export interface CurrentUser {
  id: string
  username: string
  name: string
  role: UserRole
  mustChangePassword: boolean
}

export class AuthorizationError extends Error {
  constructor(
    public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN',
    public readonly status: 401 | 403,
  ) {
    super(code)
  }
}

export async function requireUser(allowedRoles?: readonly UserRole[]): Promise<CurrentUser> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) throw new AuthorizationError('UNAUTHENTICATED', 401)

  const user = await getDb().user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
    },
  })

  if (!user?.isActive) throw new AuthorizationError('UNAUTHENTICATED', 401)
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new AuthorizationError('FORBIDDEN', 403)
  }

  return user
}

export async function requirePageUser(allowedRoles?: readonly UserRole[]): Promise<CurrentUser> {
  try {
    return await requireUser(allowedRoles)
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) redirect('/login')
    redirect('/')
  }
}

function sameOriginIsValid(request: NextRequest): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true
  const origin = request.headers.get('origin')
  if (!origin) return true

  try {
    return new URL(origin).origin === request.nextUrl.origin
  } catch {
    return false
  }
}

export async function authorizeApiRequest(
  request: NextRequest,
  allowedRoles?: readonly UserRole[],
): Promise<
  | { user: CurrentUser; requestId: string; response?: never }
  | { user?: never; requestId: string; response: NextResponse }
> {
  const requestId = request.headers.get('x-request-id')?.slice(0, 128) || crypto.randomUUID()
  if (!sameOriginIsValid(request)) {
    return {
      requestId,
      response: NextResponse.json(
        { error: { code: 'INVALID_ORIGIN', message: 'Недопустимый источник запроса' } },
        { status: 403, headers: { 'x-request-id': requestId } },
      ),
    }
  }

  try {
    return { user: await requireUser(allowedRoles), requestId }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return {
        response: NextResponse.json(
          {
            error: {
              code: error.code,
              message: error.status === 401 ? 'Требуется вход в систему' : 'Недостаточно прав',
            },
          },
          { status: error.status, headers: { 'x-request-id': requestId } },
        ),
        requestId,
      }
    }
    throw error
  }
}
