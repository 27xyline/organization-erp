import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getServerSession } from 'next-auth'
import { getDb } from '@/lib/prisma'
import {
  authorizeApiRequest,
  buildAccessContext,
  requirePermission,
  requireUser,
} from '../authorization'

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ getDb: vi.fn() }))

const findUnique = vi.fn()
const findDepartments = vi.fn()

const baseUser = {
  id: 'user-1',
  username: 'reader',
  name: 'Reader',
  role: 'VIEWER' as const,
  isActive: true,
  mustChangePassword: false,
  sessionVersion: 3,
  employeeId: null,
  employee: null,
  roleAssignments: [{
    id: 'assignment-1',
    role: 'AUDITOR' as const,
    departmentScopeMode: 'ALL' as const,
    projectScopeMode: 'ALL' as const,
    departmentScopes: [],
    projectScopes: [],
  }],
}

function activeSession(sessionVersion = baseUser.sessionVersion) {
  return { user: { id: baseUser.id, sessionVersion } } as never
}

describe('authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDb).mockReturnValue({
      user: { findUnique },
      department: { findMany: findDepartments },
    } as never)
    findDepartments.mockResolvedValue([])
  })

  it('rejects a request without a session', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)
    await expect(requireUser()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
  })

  it('revalidates that the database user is active', async () => {
    vi.mocked(getServerSession).mockResolvedValue(activeSession())
    findUnique.mockResolvedValue({ ...baseUser, isActive: false })
    await expect(requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })

  it('invalidates a JWT when its session version is stale', async () => {
    vi.mocked(getServerSession).mockResolvedValue(activeSession(baseUser.sessionVersion - 1))
    findUnique.mockResolvedValue(baseUser)

    await expect(requireUser()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
  })

  it('rejects legacy JWTs that do not carry a session version', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: baseUser.id } } as never)

    await expect(requireUser()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('allows only the password endpoint while a password change is required', async () => {
    vi.mocked(getServerSession).mockResolvedValue(activeSession())
    findUnique.mockResolvedValue({ ...baseUser, mustChangePassword: true })

    const blocked = await authorizeApiRequest(
      new NextRequest('http://localhost/api/assets'),
      'assets.read',
    )
    expect(blocked.response?.status).toBe(403)
    await expect(blocked.response?.json()).resolves.toMatchObject({
      error: { code: 'PASSWORD_CHANGE_REQUIRED' },
    })

    const allowed = await authorizeApiRequest(
      new NextRequest('http://localhost/api/account/password', { method: 'POST' }),
    )
    expect(allowed.response).toBeUndefined()
    expect(allowed.user).toMatchObject({ id: baseUser.id })
  })

  it('blocks cross-origin mutations before running domain code', async () => {
    const request = new NextRequest('http://localhost/api/assets', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
    })
    const result = await authorizeApiRequest(request, 'assets.create')
    expect(result.response?.status).toBe(403)
    expect(getServerSession).not.toHaveBeenCalled()
  })

  it('expands assigned departments to descendants but not siblings', () => {
    const access = buildAccessContext({
      ...baseUser,
      roleAssignments: [{
        id: 'hr',
        role: 'HR',
        departmentScopeMode: 'ASSIGNED',
        projectScopeMode: 'NONE',
        departmentScopes: [{ departmentId: 'root' }],
        projectScopes: [],
      }],
    }, [
      { id: 'root', parentId: null },
      { id: 'child', parentId: 'root' },
      { id: 'grandchild', parentId: 'child' },
      { id: 'sibling', parentId: null },
    ])

    expect(access.allows('employees.update', {
      employeeId: 'employee-1',
      departmentId: 'grandchild',
    })).toBe(true)
    expect(access.allows('employees.update', {
      employeeId: 'employee-2',
      departmentId: 'sibling',
    })).toBe(false)
  })

  it('does not combine department and project scopes from different roles', () => {
    const access = buildAccessContext({
      ...baseUser,
      roleAssignments: [
        {
          id: 'accountant-a',
          role: 'ACCOUNTANT',
          departmentScopeMode: 'ASSIGNED',
          projectScopeMode: 'ASSIGNED',
          departmentScopes: [{ departmentId: 'department-a' }],
          projectScopes: [{ projectId: 'project-a' }],
        },
        {
          id: 'accountant-b',
          role: 'ACCOUNTANT',
          departmentScopeMode: 'ASSIGNED',
          projectScopeMode: 'ASSIGNED',
          departmentScopes: [{ departmentId: 'department-b' }],
          projectScopes: [{ projectId: 'project-b' }],
        },
      ],
    }, [])

    expect(access.allows('financePlans.update', {
      departmentId: 'department-a',
      projectId: 'project-a',
    })).toBe(true)
    expect(access.allows('financePlans.update', {
      departmentId: 'department-a',
      projectId: 'project-b',
    })).toBe(false)
    expect(access.financeEntryWhere('financePlans.read')).toEqual({
      OR: [
        {
          AND: [
            { employee: { departmentId: { in: ['department-a'] } } },
            { projectId: { in: ['project-a'] } },
          ],
        },
        {
          AND: [
            { employee: { departmentId: { in: ['department-b'] } } },
            { projectId: { in: ['project-b'] } },
          ],
        },
      ],
    })
  })

  it('does not expose unassigned assets through an ALL project scope', () => {
    const access = buildAccessContext({
      ...baseUser,
      roleAssignments: [{
        id: 'project-manager',
        role: 'PROJECT_MANAGER',
        departmentScopeMode: 'NONE',
        projectScopeMode: 'ALL',
        departmentScopes: [],
        projectScopes: [],
      }],
    }, [])

    expect(access.assetWhere('assets.read')).toEqual({
      OR: [{ projectId: { not: null } }],
    })
  })

  it('derives SELF employee and project access from the linked employee', () => {
    const access = buildAccessContext({
      ...baseUser,
      employeeId: 'employee-1',
      employee: {
        departmentId: 'department-a',
        projectMembers: [{ projectId: 'project-a' }],
      },
      roleAssignments: [{
        id: 'employee',
        role: 'EMPLOYEE',
        departmentScopeMode: 'SELF',
        projectScopeMode: 'SELF',
        departmentScopes: [],
        projectScopes: [],
      }],
    }, [])

    expect(access.allows('employees.read', {
      employeeId: 'employee-1',
      departmentId: 'department-a',
    })).toBe(true)
    expect(access.allows('employees.read', {
      employeeId: 'employee-2',
      departmentId: 'department-a',
    })).toBe(false)
    expect(access.allows('tasks.read', { projectId: 'project-a' })).toBe(true)
    expect(access.allows('tasks.read', { projectId: 'project-b' })).toBe(false)
  })

  it('enforces permission requirements from current database assignments', async () => {
    vi.mocked(getServerSession).mockResolvedValue(activeSession())
    findUnique.mockResolvedValue(baseUser)
    await expect(requirePermission('assets.read')).resolves.toMatchObject({
      roles: ['AUDITOR'],
    })
    await expect(requirePermission('assets.update')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    })
  })

  it('does not derive permissions from the legacy role when assignments are empty', async () => {
    vi.mocked(getServerSession).mockResolvedValue(activeSession())
    findUnique.mockResolvedValue({
      ...baseUser,
      role: 'ADMIN',
      roleAssignments: [],
    })

    await expect(requirePermission('assets.read')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    })
  })
})
