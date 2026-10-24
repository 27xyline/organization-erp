import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { UserRole } from '@prisma/client'
import { backendFetch, BackendRequestError } from '@/lib/backend/client'
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

export async function requireUser(): Promise<CurrentUser> {
  const cookieHeader = (await cookies()).toString()
  let response: Response
  try {
    response = await backendFetch('/api/account/me', {
      headers: { cookie: cookieHeader, accept: 'application/json' },
      cache: 'no-store',
    }, { forwardCookies: true })
  } catch (error) {
    if (error instanceof BackendRequestError && error.status < 500) {
      throw new AuthorizationError('UNAUTHENTICATED', 401)
    }
    throw error
  }
  if (response.status === 401) throw new AuthorizationError('UNAUTHENTICATED', 401)
  if (response.status === 403) throw new AuthorizationError('FORBIDDEN', 403)
  if (!response.ok) throw new BackendRequestError('Unable to load current account', response.status)

  try {
    const envelope = await response.json() as { data?: BackendActor }
    const actor = envelope.data
    if (!actor || !actor.id || !actor.username || !Number.isSafeInteger(actor.sessionVersion)) {
      throw new Error('Invalid Python actor response')
    }
    const grants: ScopeGrant[] = actor.access.grants.map((grant) => ({
      assignmentId: grant.assignmentId,
      role: grant.role as AppRole,
      departmentScopeMode: grant.departmentScopeMode as ScopeMode,
      projectScopeMode: grant.projectScopeMode as ScopeMode,
      departmentIds: grant.departmentIds,
      projectIds: grant.projectIds,
    }))
    return {
      id: actor.id,
      username: actor.username,
      name: actor.name,
      role: actor.role as UserRole,
      roles: actor.roles as AppRole[],
      permissions: actor.permissions as Permission[],
      employeeId: actor.employeeId,
      mustChangePassword: actor.mustChangePassword,
      sessionVersion: actor.sessionVersion,
      access: new AccessContext({
        userId: actor.access.identity.userId,
        employeeId: actor.access.identity.employeeId,
        employeeDepartmentId: actor.access.identity.employeeDepartmentId,
        memberProjectIds: actor.access.identity.memberProjectIds,
      }, grants),
    }
  } catch (cause) {
    throw new BackendRequestError('Python returned invalid account data', 502, cause)
  }
}

type BackendActor = {
  id: string
  username: string
  name: string
  role: string
  roles: string[]
  permissions: string[]
  employeeId: string | null
  mustChangePassword: boolean
  sessionVersion: number
  access: {
    identity: {
      userId: string
      employeeId: string | null
      employeeDepartmentId: string | null
      memberProjectIds: string[]
    }
    grants: Array<{
      assignmentId: string
      role: string
      departmentScopeMode: string
      projectScopeMode: string
      departmentIds: string[]
      projectIds: string[]
    }>
  }
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
    const targetOrigin = request.nextUrl.origin
    return new URL(origin).origin === targetOrigin
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
  if (permissions.has('dashboard.read')) return '/'
  if (permissions.has('projects.read')) return '/projects'
  if (permissions.has('assets.read')) return '/assets'
  if (permissions.has('employees.read')) return '/employees'
  if (permissions.has('finance.salary.read')) return '/finance/salary'
  if (permissions.has('financePlans.read')) return '/finance/oklad'
  if (permissions.has('mols.read')) return '/mols'
  if (permissions.has('assetGroups.read')) return '/groups'
  if (permissions.has('access.users.read')) return '/admin/users'
  return '/account/password'
}
