import type { AppRole, Permission, ScopeMode } from './permissions'
import { PERMISSION_SCOPE, roleHasPermission } from './permissions'

export interface PermissionTarget {
  employeeId?: string
  departmentId?: string
  departmentIds?: readonly string[]
  projectId?: string
  projectIds?: readonly string[]
}

export interface ScopeGrant {
  assignmentId: string
  role: AppRole
  departmentScopeMode: ScopeMode
  projectScopeMode: ScopeMode
  departmentIds: readonly string[]
  projectIds: readonly string[]
}

export interface AccessIdentity {
  userId: string
  employeeId: string | null
  employeeDepartmentId: string | null
  memberProjectIds: readonly string[]
}

function unique(values: readonly (string | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

export class AccessContext {
  constructor(
    readonly identity: AccessIdentity,
    readonly grants: readonly ScopeGrant[],
  ) {}

  get roles(): AppRole[] {
    return Array.from(new Set(this.grants.map((grant) => grant.role)))
  }

  get permissions(): Permission[] {
    const permissions = new Set<Permission>()
    for (const grant of this.grants) {
      for (const permission of Object.keys(PERMISSION_SCOPE) as Permission[]) {
        if (roleHasPermission(grant.role, permission)) permissions.add(permission)
      }
    }
    return Array.from(permissions)
  }

  has(permission: Permission): boolean {
    return this.grants.some((grant) => roleHasPermission(grant.role, permission))
  }

  private departmentAllowed(grant: ScopeGrant, ids: readonly string[]): boolean {
    if (!ids.length) return false
    if (grant.departmentScopeMode === 'ALL') return true
    if (grant.departmentScopeMode === 'SELF') {
      return Boolean(this.identity.employeeDepartmentId) &&
        ids.every((id) => id === this.identity.employeeDepartmentId)
    }
    if (grant.departmentScopeMode !== 'ASSIGNED') return false
    const allowed = new Set(grant.departmentIds)
    return ids.every((id) => allowed.has(id))
  }

  private projectAllowed(grant: ScopeGrant, ids: readonly string[]): boolean {
    if (!ids.length) return false
    if (grant.projectScopeMode === 'ALL') return true
    if (grant.projectScopeMode === 'SELF') {
      const memberships = new Set(this.identity.memberProjectIds)
      return ids.every((id) => memberships.has(id))
    }
    if (grant.projectScopeMode !== 'ASSIGNED') return false
    const allowed = new Set(grant.projectIds)
    return ids.every((id) => allowed.has(id))
  }

  allows(permission: Permission, target: PermissionTarget = {}): boolean {
    const kind = PERMISSION_SCOPE[permission]
    const departmentIds = unique([target.departmentId, ...(target.departmentIds || [])])
    const projectIds = unique([target.projectId, ...(target.projectIds || [])])

    return this.grants.some((grant) => {
      if (!roleHasPermission(grant.role, permission)) return false
      if (kind === 'none') return true
      if (kind === 'employee') {
        if (grant.departmentScopeMode === 'SELF') {
          return Boolean(target.employeeId) && target.employeeId === this.identity.employeeId
        }
        return this.departmentAllowed(grant, departmentIds)
      }
      if (kind === 'department') return this.departmentAllowed(grant, departmentIds)
      if (kind === 'project') return this.projectAllowed(grant, projectIds)
      if (kind === 'finance') {
        const departmentPass = target.employeeId === this.identity.employeeId &&
          grant.departmentScopeMode === 'SELF'
          ? true
          : this.departmentAllowed(grant, departmentIds)
        return departmentPass && this.projectAllowed(grant, projectIds)
      }
      if (kind === 'asset') {
        return this.departmentAllowed(grant, departmentIds) || this.projectAllowed(grant, projectIds)
      }
      return false
    })
  }

  grantsFor(permission: Permission): ScopeGrant[] {
    return this.grants.filter((grant) => roleHasPermission(grant.role, permission))
  }

  employeeWhere(permission: Permission): Record<string, unknown> {
    const clauses = this.grantsFor(permission).flatMap((grant) => {
      if (grant.departmentScopeMode === 'ALL') return [{}]
      if (grant.departmentScopeMode === 'SELF') {
        return this.identity.employeeId ? [{ id: this.identity.employeeId }] : []
      }
      if (grant.departmentScopeMode === 'ASSIGNED' && grant.departmentIds.length) {
        return [{ departmentId: { in: grant.departmentIds } }]
      }
      return []
    })
    return clauses.some((clause) => Object.keys(clause).length === 0)
      ? {}
      : { OR: clauses.length ? clauses : [{ id: '__forbidden__' }] }
  }

  departmentWhere(permission: Permission): Record<string, unknown> {
    const clauses = this.grantsFor(permission).flatMap((grant) => {
      if (grant.departmentScopeMode === 'ALL') return [{}]
      if (grant.departmentScopeMode === 'SELF' && this.identity.employeeDepartmentId) {
        return [{ id: this.identity.employeeDepartmentId }]
      }
      if (grant.departmentScopeMode === 'ASSIGNED' && grant.departmentIds.length) {
        return [{ id: { in: grant.departmentIds } }]
      }
      return []
    })
    return clauses.some((clause) => Object.keys(clause).length === 0)
      ? {}
      : { OR: clauses.length ? clauses : [{ id: '__forbidden__' }] }
  }

  projectWhere(permission: Permission): Record<string, unknown> {
    const clauses = this.grantsFor(permission).flatMap((grant) => {
      if (grant.projectScopeMode === 'ALL') return [{}]
      if (grant.projectScopeMode === 'SELF' && this.identity.memberProjectIds.length) {
        return [{ id: { in: this.identity.memberProjectIds } }]
      }
      if (grant.projectScopeMode === 'ASSIGNED' && grant.projectIds.length) {
        return [{ id: { in: grant.projectIds } }]
      }
      return []
    })
    return clauses.some((clause) => Object.keys(clause).length === 0)
      ? {}
      : { OR: clauses.length ? clauses : [{ id: '__forbidden__' }] }
  }

  assetWhere(permission: Permission): Record<string, unknown> {
    const clauses = this.grantsFor(permission).flatMap((grant) => {
      if (grant.departmentScopeMode === 'ALL' || grant.projectScopeMode === 'ALL') return [{}]
      const scoped: Record<string, unknown>[] = []
      const departmentIds = grant.departmentScopeMode === 'SELF'
        ? unique([this.identity.employeeDepartmentId || undefined])
        : grant.departmentIds
      const projectIds = grant.projectScopeMode === 'SELF'
        ? this.identity.memberProjectIds
        : grant.projectIds
      if (departmentIds.length) {
        scoped.push({
          holdings: {
            some: {
              quantity: { gt: 0 },
              mol: { departmentId: { in: departmentIds } },
            },
          },
        })
      }
      if (projectIds.length) scoped.push({ projectId: { in: projectIds } })
      return scoped
    })
    return clauses.some((clause) => Object.keys(clause).length === 0)
      ? {}
      : { OR: clauses.length ? clauses : [{ id: '__forbidden__' }] }
  }
}
