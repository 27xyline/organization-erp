import type { AppRole, Permission, ScopeMode } from './permissions'
import { PERMISSION_SCOPE, roleHasPermission } from './permissions'

export interface PermissionTarget {
  employeeId?: string
  departmentId?: string
  departmentIds?: readonly string[]
  projectId?: string
  projectIds?: readonly string[]
  documentEmployeeId?: string
  documentEmployeeDepartmentId?: string
  documentProjectId?: string
  documentAssetDepartmentIds?: readonly string[]
  documentAssetProjectId?: string
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

  private departmentAnyAllowed(grant: ScopeGrant, ids: readonly string[]): boolean {
    if (!ids.length) return false
    if (grant.departmentScopeMode === 'ALL') return true
    const allowed = grant.departmentScopeMode === 'SELF'
      ? new Set(this.identity.employeeDepartmentId ? [this.identity.employeeDepartmentId] : [])
      : new Set(grant.departmentScopeMode === 'ASSIGNED' ? grant.departmentIds : [])
    return ids.some((id) => allowed.has(id))
  }

  private projectAnyAllowed(grant: ScopeGrant, ids: readonly string[]): boolean {
    if (!ids.length) return false
    if (grant.projectScopeMode === 'ALL') return true
    const allowed = grant.projectScopeMode === 'SELF'
      ? new Set(this.identity.memberProjectIds)
      : new Set(grant.projectScopeMode === 'ASSIGNED' ? grant.projectIds : [])
    return ids.some((id) => allowed.has(id))
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
        return this.departmentAnyAllowed(grant, departmentIds) ||
          this.projectAnyAllowed(grant, projectIds)
      }
      if (kind === 'document') {
        const hasEmployeeLink = Boolean(target.documentEmployeeId)
        const hasProjectLink = Boolean(target.documentProjectId)
        const hasAssetLink = Boolean(
          target.documentAssetProjectId || target.documentAssetDepartmentIds?.length,
        )
        if (!hasEmployeeLink && !hasProjectLink && !hasAssetLink) {
          return ['ADMIN', 'AUDITOR'].includes(grant.role)
            && grant.departmentScopeMode === 'ALL'
            && grant.projectScopeMode === 'ALL'
        }

        const employeePass = !hasEmployeeLink || (
          grant.departmentScopeMode === 'SELF'
            ? target.documentEmployeeId === this.identity.employeeId
            : this.departmentAllowed(
                grant,
                target.documentEmployeeDepartmentId
                  ? [target.documentEmployeeDepartmentId]
                  : [],
              )
        )
        const projectPass = !hasProjectLink || this.projectAllowed(
          grant,
          target.documentProjectId ? [target.documentProjectId] : [],
        )
        const assetPass = !hasAssetLink || (
          this.departmentAnyAllowed(grant, target.documentAssetDepartmentIds || [])
          || this.projectAnyAllowed(
            grant,
            target.documentAssetProjectId ? [target.documentAssetProjectId] : [],
          )
        )
        return employeePass && projectPass && assetPass
      }
      return false
    })
  }

  grantsFor(permission: Permission): ScopeGrant[] {
    return this.grants.filter((grant) => roleHasPermission(grant.role, permission))
  }

  allowedDepartmentIds(permission: Permission): string[] | null {
    const ids = new Set<string>()
    for (const grant of this.grantsFor(permission)) {
      if (grant.departmentScopeMode === 'ALL') return null
      if (grant.departmentScopeMode === 'SELF' && this.identity.employeeDepartmentId) {
        ids.add(this.identity.employeeDepartmentId)
      }
      if (grant.departmentScopeMode === 'ASSIGNED') {
        grant.departmentIds.forEach((id) => ids.add(id))
      }
    }
    return Array.from(ids)
  }

  allowedProjectIds(permission: Permission): string[] | null {
    const ids = new Set<string>()
    for (const grant of this.grantsFor(permission)) {
      if (grant.projectScopeMode === 'ALL') return null
      if (grant.projectScopeMode === 'SELF') {
        this.identity.memberProjectIds.forEach((id) => ids.add(id))
      }
      if (grant.projectScopeMode === 'ASSIGNED') {
        grant.projectIds.forEach((id) => ids.add(id))
      }
    }
    return Array.from(ids)
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

  financeEntryWhere(permission: Permission): Record<string, unknown> {
    const clauses = this.grantsFor(permission).flatMap((grant) => {
      const employeeClause = (() => {
        if (grant.departmentScopeMode === 'ALL') return {}
        if (grant.departmentScopeMode === 'SELF' && this.identity.employeeId) {
          return { employeeId: this.identity.employeeId }
        }
        if (grant.departmentScopeMode === 'ASSIGNED' && grant.departmentIds.length) {
          return { employee: { departmentId: { in: grant.departmentIds } } }
        }
        return null
      })()
      const projectClause = (() => {
        if (grant.projectScopeMode === 'ALL') return { projectId: { not: null } }
        if (grant.projectScopeMode === 'SELF' && this.identity.memberProjectIds.length) {
          return { projectId: { in: this.identity.memberProjectIds } }
        }
        if (grant.projectScopeMode === 'ASSIGNED' && grant.projectIds.length) {
          return { projectId: { in: grant.projectIds } }
        }
        return null
      })()

      if (!employeeClause || !projectClause) return []
      return [{ AND: [employeeClause, projectClause] }]
    })

    return { OR: clauses.length ? clauses : [{ id: '__forbidden__' }] }
  }

  assetWhere(permission: Permission): Record<string, unknown> {
    const clauses = this.grantsFor(permission).flatMap((grant) => {
      if (
        ['ADMIN', 'AUDITOR'].includes(grant.role) &&
        grant.departmentScopeMode === 'ALL' &&
        grant.projectScopeMode === 'ALL'
      ) return [{}]
      const scoped: Record<string, unknown>[] = []
      const departmentIds = grant.departmentScopeMode === 'SELF'
        ? unique([this.identity.employeeDepartmentId || undefined])
        : grant.departmentIds
      const projectIds = grant.projectScopeMode === 'SELF'
        ? this.identity.memberProjectIds
        : grant.projectIds
      if (grant.departmentScopeMode === 'ALL') {
        scoped.push({ molId: { not: '' } })
      } else if (departmentIds.length) {
        scoped.push({
          OR: [
            { mol: { departmentId: { in: departmentIds } } },
            {
              holdings: {
                some: {
                  quantity: { gt: 0 },
                  mol: { departmentId: { in: departmentIds } },
                },
              },
            },
          ],
        })
      }
      if (grant.projectScopeMode === 'ALL') {
        scoped.push({ projectId: { not: null } })
      } else if (projectIds.length) {
        scoped.push({ projectId: { in: projectIds } })
      }
      return scoped
    })
    return clauses.some((clause) => Object.keys(clause).length === 0)
      ? {}
      : { OR: clauses.length ? clauses : [{ id: '__forbidden__' }] }
  }

  documentWhere(permission: Permission): Record<string, unknown> {
    const forbidden = { id: '__forbidden__' }
    const clauses = this.grantsFor(permission).map((grant) => {
      if (
        ['ADMIN', 'AUDITOR'].includes(grant.role)
        && grant.departmentScopeMode === 'ALL'
        && grant.projectScopeMode === 'ALL'
      ) return {}

      const employeeClause = (() => {
        if (grant.departmentScopeMode === 'ALL') return { employeeId: { not: null } }
        if (grant.departmentScopeMode === 'SELF' && this.identity.employeeId) {
          return { employeeId: this.identity.employeeId }
        }
        if (grant.departmentScopeMode === 'ASSIGNED' && grant.departmentIds.length) {
          return { employee: { departmentId: { in: grant.departmentIds } } }
        }
        return forbidden
      })()

      const projectClause = (() => {
        if (grant.projectScopeMode === 'ALL') return { projectId: { not: null } }
        const ids = grant.projectScopeMode === 'SELF'
          ? this.identity.memberProjectIds
          : grant.projectScopeMode === 'ASSIGNED'
            ? grant.projectIds
            : []
        return ids.length ? { projectId: { in: ids } } : forbidden
      })()

      const assetScopeClauses: Record<string, unknown>[] = []
      if (grant.departmentScopeMode === 'ALL') {
        assetScopeClauses.push({ id: { not: '' } })
      } else {
        const departmentIds = grant.departmentScopeMode === 'SELF'
          ? unique([this.identity.employeeDepartmentId || undefined])
          : grant.departmentScopeMode === 'ASSIGNED'
            ? grant.departmentIds
            : []
        if (departmentIds.length) {
          assetScopeClauses.push({
            OR: [
              { mol: { departmentId: { in: departmentIds } } },
              {
                holdings: {
                  some: {
                    quantity: { gt: 0 },
                    mol: { departmentId: { in: departmentIds } },
                  },
                },
              },
            ],
          })
        }
      }
      if (grant.projectScopeMode === 'ALL') {
        assetScopeClauses.push({ projectId: { not: null } })
      } else {
        const projectIds = grant.projectScopeMode === 'SELF'
          ? this.identity.memberProjectIds
          : grant.projectScopeMode === 'ASSIGNED'
            ? grant.projectIds
            : []
        if (projectIds.length) assetScopeClauses.push({ projectId: { in: projectIds } })
      }
      const assetClause = assetScopeClauses.length
        ? { asset: { OR: assetScopeClauses } }
        : forbidden

      return {
        AND: [
          { OR: [{ employeeId: null }, employeeClause] },
          { OR: [{ projectId: null }, projectClause] },
          { OR: [{ assetId: null }, assetClause] },
          {
            OR: [
              { employeeId: { not: null } },
              { projectId: { not: null } },
              { assetId: { not: null } },
            ],
          },
        ],
      }
    })
    return clauses.some((clause) => Object.keys(clause).length === 0)
      ? {}
      : { OR: clauses.length ? clauses : [forbidden] }
  }
}
