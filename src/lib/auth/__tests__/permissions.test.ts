import { describe, expect, it } from 'vitest'
import { APP_ROLES, PERMISSIONS, ROLE_PERMISSIONS } from '../permissions'

describe('built-in permission matrix', () => {
  it('keeps ADMIN unrestricted', () => {
    expect(ROLE_PERMISSIONS.ADMIN.size).toBe(PERMISSIONS.length)
  })

  it('keeps AUDITOR read-only', () => {
    expect(Array.from(ROLE_PERMISSIONS.AUDITOR)).toEqual(
      expect.arrayContaining(['employees.read', 'financePlans.read', 'assets.read']),
    )
    expect(Array.from(ROLE_PERMISSIONS.AUDITOR).filter(
      (permission) => permission !== 'account.password.update',
    ).some((permission) =>
      permission.endsWith('.create') ||
      permission.endsWith('.update') ||
      permission.endsWith('.delete')
    )).toBe(false)
  })

  it('does not grant user administration to any non-admin role', () => {
    for (const role of APP_ROLES.filter((value) => value !== 'ADMIN')) {
      expect(Array.from(ROLE_PERMISSIONS[role]).some((permission) =>
        permission.startsWith('access.')
      )).toBe(false)
    }
  })

  it('separates sensitive project payroll from project management', () => {
    expect(ROLE_PERMISSIONS.PROJECT_MANAGER.has('projectPayroll.read')).toBe(false)
    expect(ROLE_PERMISSIONS.ACCOUNTANT.has('projectPayroll.read')).toBe(true)
  })

  it('reserves shared approval-template management for administrators', () => {
    expect(ROLE_PERMISSIONS.ADMIN.has('approvals.templates.manage')).toBe(true)
    for (const role of APP_ROLES.filter((value) => value !== 'ADMIN')) {
      expect(ROLE_PERMISSIONS[role].has('approvals.templates.manage')).toBe(false)
    }
  })
})
