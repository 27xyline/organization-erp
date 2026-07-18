import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getDb } from '@/lib/prisma'
import { AccessContext, type PermissionTarget, type ScopeGrant } from './access-context'
import {
  DEFAULT_ROLE_SCOPES,
  type AppRole,
  type Permission,
  type ScopeMode,
} from './permissions'

export type PermissionRequirement =
  | Permission
  | { permission: Permission }
  | { allOf: readonly Permission[] }
  | { anyOf: readonly Permission[] }

export interface CurrentUser {
  id: string
  username: string
  name: string
  role: UserRole
  roles: AppRole[]
  permissions: Permission[]
  employeeId: string | null
  mustChangePassword: boolean
  sessionVersion: number
  access: AccessContext
}

export class AuthorizationError extends Error {
  constructor(
    public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN',
    public readonly status: 401 | 403,
  ) {
    super(code)
  }
}

type AssignmentRecord = {
  id: string
  role: AppRole
  departmentScopeMode: ScopeMode
  projectScopeMode: ScopeMode
  departmentScopes: Array<{ departmentId: string }>
  projectScopes: Array<{ projectId: string }>
}

type AuthorizationUserRecord = {
  id: string
  username: string
  name: string
  role: UserRole
  isActive: boolean
  mustChangePassword: boolean
  sessionVersion: number
  employeeId: string | null
  employee: {
    departmentId: string
    projectMembers: Array<{ projectId: string }>
  } | null
  roleAssignments: AssignmentRecord[]
}

function expandDescendants(
  roots: readonly string[],
  departments: readonly { id: string; parentId: string | null }[],
): string[] {
  const result = new Set(roots)
  const children = new Map<string, string[]>()
  for (const department of departments) {
    if (!department.parentId) continue
    const values = children.get(department.parentId) || []
    values.push(department.id)
    children.set(department.parentId, values)
  }
  const queue = [...roots]
  while (queue.length) {
    const current = queue.shift()!
    for (const child of children.get(current) || []) {
      if (result.has(child)) continue
      result.add(child)
      queue.push(child)
    }
  }
  return Array.from(result)
}

export function buildAccessContext(
  user: AuthorizationUserRecord,
  departments: readonly { id: string; parentId: string | null }[],
): AccessContext {
  const grants: ScopeGrant[] = user.roleAssignments.map((assignment) => ({
    assignmentId: assignment.id,
    role: assignment.role,
    departmentScopeMode: assignment.departmentScopeMode,
    projectScopeMode: assignment.projectScopeMode,
    departmentIds: assignment.departmentScopeMode === 'ASSIGNED'
      ? expandDescendants(
          assignment.departmentScopes.map((scope) => scope.departmentId),
          departments,
        )
      : [],
    projectIds: assignment.projectScopeMode === 'ASSIGNED'
      ? assignment.projectScopes.map((scope) => scope.projectId)
      : [],
  }))

  return new AccessContext(
    {
      userId: user.id,
      employeeId: user.employeeId,
      employeeDepartmentId: user.employee?.departmentId || null,
      memberProjectIds: user.employee?.projectMembers.map((member) => member.projectId) || [],
    },
    grants,
  )
}

async function loadCurrentUser(id: string, sessionVersion: number): Promise<CurrentUser | null> {
  const db = getDb()
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
      sessionVersion: true,
      employeeId: true,
      employee: {
        select: {
          departmentId: true,
          projectMembers: {
            where: { isArchived: false },
            select: { projectId: true },
          },
        },
      },
      roleAssignments: {
        include: {
          departmentScopes: { select: { departmentId: true } },
          projectScopes: { select: { projectId: true } },
        },
      },
    },
  }) as AuthorizationUserRecord | null

  if (!user?.isActive || user.sessionVersion !== sessionVersion) return null

  const hasAssignedDepartments = user.roleAssignments.some(
    (assignment) => assignment.departmentScopeMode === 'ASSIGNED',
  )
  const departments = hasAssignedDepartments
    ? await db.department.findMany({ select: { id: true, parentId: true } })
    : []
  const access = buildAccessContext(user, departments)
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    roles: access.roles,
    permissions: access.permissions,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
    sessionVersion: user.sessionVersion,
    access,
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const session = await getServerSession(authOptions)
  if (
    !session?.user?.id ||
    !Number.isSafeInteger(session.user.sessionVersion) ||
    session.user.sessionVersion < 1
  ) {
    throw new AuthorizationError('UNAUTHENTICATED', 401)
  }
  const user = await loadCurrentUser(session.user.id, session.user.sessionVersion)
  if (!user) throw new AuthorizationError('UNAUTHENTICATED', 401)
  return user
}

function requiredPermissions(requirement: PermissionRequirement): {
  mode: 'all' | 'any'
  permissions: readonly Permission[]
} {
  if (typeof requirement === 'string') return { mode: 'all', permissions: [requirement] }
  if ('permission' in requirement) return { mode: 'all', permissions: [requirement.permission] }
  if ('allOf' in requirement) return { mode: 'all', permissions: requirement.allOf }
  return { mode: 'any', permissions: requirement.anyOf }
}

function authorizeRequirement(
  user: CurrentUser,
  requirement: PermissionRequirement,
  target?: PermissionTarget,
) {
  const required = requiredPermissions(requirement)
  const checks = required.permissions.map((permission) =>
    target === undefined ? user.access.has(permission) : user.access.allows(permission, target)
  )
  const allowed = required.mode === 'all' ? checks.every(Boolean) : checks.some(Boolean)
  if (!allowed) throw new AuthorizationError('FORBIDDEN', 403)
}

export async function requirePermission(
  requirement: PermissionRequirement,
  target?: PermissionTarget,
): Promise<CurrentUser> {
  const user = await requireUser()
  authorizeRequirement(user, requirement, target)
  return user
}

export async function requirePageUser(): Promise<CurrentUser> {
  try {
    return await requireUser()
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) redirect('/login')
    redirect('/forbidden')
  }
}

export async function requirePagePermission(
  requirement: PermissionRequirement,
  target?: PermissionTarget,
): Promise<CurrentUser> {
  try {
    return await requirePermission(requirement, target)
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401) redirect('/login')
    redirect('/forbidden')
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
  requirement?: PermissionRequirement,
): Promise<
  | { user: CurrentUser; access: AccessContext; requestId: string; response?: never }
  | { user?: never; access?: never; requestId: string; response: NextResponse }
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
    const user = await requireUser()
    if (user.mustChangePassword && request.nextUrl.pathname !== '/api/account/password') {
      return {
        requestId,
        response: NextResponse.json(
          {
            error: {
              code: 'PASSWORD_CHANGE_REQUIRED',
              message: 'Необходимо изменить временный пароль',
            },
          },
          { status: 403, headers: { 'x-request-id': requestId } },
        ),
      }
    }

    if (requirement) {
      authorizeRequirement(user, requirement)
    }
    return { user, access: user.access, requestId }
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

export function assertPermission(
  user: CurrentUser,
  permission: Permission,
  target: PermissionTarget,
) {
  if (!user.access.allows(permission, target)) {
    throw new AuthorizationError('FORBIDDEN', 403)
  }
}

export function defaultScopesForRole(role: AppRole) {
  return DEFAULT_ROLE_SCOPES[role]
}

export function defaultLandingPath(
  user: Pick<CurrentUser, 'permissions' | 'mustChangePassword'>,
): string {
  if (user.mustChangePassword) return '/account/password'
  const permissions = new Set(user.permissions)
  if (permissions.has('assets.read')) return '/'
  if (permissions.has('projects.read')) return '/projects'
  if (permissions.has('employees.read')) return '/employees'
  if (permissions.has('finance.salary.read')) return '/finance/salary'
  if (permissions.has('financePlans.read')) return '/finance/oklad'
  if (permissions.has('mols.read')) return '/mols'
  if (permissions.has('assetGroups.read')) return '/groups'
  if (permissions.has('access.users.read')) return '/admin/users'
  return '/account/password'
}
