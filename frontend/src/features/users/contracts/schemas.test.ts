import { describe, expect, it } from 'vitest'
import { changePasswordSchema, createUserSchema, updateUserSchema } from './schemas'

const base = {
  username: 'employee.user',
  name: 'Employee User',
  temporaryPassword: 'temporary-password',
}

describe('scoped user schemas', () => {
  it('accepts multiple role assignments with explicit scopes', () => {
    expect(createUserSchema.safeParse({
      ...base,
      assignments: [
        {
          role: 'HR',
          departmentScopeMode: 'ASSIGNED',
          projectScopeMode: 'NONE',
          departmentIds: ['department-1'],
          projectIds: [],
        },
        {
          role: 'PROJECT_MANAGER',
          departmentScopeMode: 'NONE',
          projectScopeMode: 'ASSIGNED',
          departmentIds: [],
          projectIds: ['project-1'],
        },
      ],
    }).success).toBe(true)
  })

  it('rejects an empty ASSIGNED scope', () => {
    expect(createUserSchema.safeParse({
      ...base,
      assignments: [{
        role: 'HR',
        departmentScopeMode: 'ASSIGNED',
        projectScopeMode: 'NONE',
        departmentIds: [],
        projectIds: [],
      }],
    }).success).toBe(false)
  })

  it('rejects duplicate roles', () => {
    const assignment = {
      role: 'AUDITOR',
      departmentScopeMode: 'ALL',
      projectScopeMode: 'ALL',
      departmentIds: [],
      projectIds: [],
    }
    expect(createUserSchema.safeParse({
      ...base,
      assignments: [assignment, assignment],
    }).success).toBe(false)
  })

  it('requires an employee link for the EMPLOYEE role', () => {
    expect(createUserSchema.safeParse({
      ...base,
      employeeId: null,
      assignments: [{
        role: 'EMPLOYEE',
        departmentScopeMode: 'SELF',
        projectScopeMode: 'SELF',
        departmentIds: [],
        projectIds: [],
      }],
    }).success).toBe(false)
  })

  it('rejects scope rows for ALL, NONE and SELF modes', () => {
    expect(createUserSchema.safeParse({
      ...base,
      assignments: [{
        role: 'AUDITOR',
        departmentScopeMode: 'ALL',
        projectScopeMode: 'ALL',
        departmentIds: ['department-1'],
        projectIds: [],
      }],
    }).success).toBe(false)
  })
})

describe('password lengths', () => {
  it.each(['x', 'x'.repeat(513), ' '])('accepts nonempty passwords in user and password changes', (password) => {
    const assignments = [{ role: 'AUDITOR', departmentScopeMode: 'ALL', projectScopeMode: 'ALL', departmentIds: [], projectIds: [] }]
    expect(createUserSchema.safeParse({ ...base, assignments, temporaryPassword: password }).success).toBe(true)
    expect(updateUserSchema.safeParse({ temporaryPassword: password }).success).toBe(true)
    expect(changePasswordSchema.safeParse({ currentPassword: password, newPassword: `${password}x` }).success).toBe(true)
  })

  it('rejects empty passwords', () => {
    expect(updateUserSchema.safeParse({ temporaryPassword: '' }).success).toBe(false)
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: '' }).success).toBe(false)
  })
})
