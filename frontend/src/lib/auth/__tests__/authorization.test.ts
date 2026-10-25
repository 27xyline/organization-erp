import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cookies } from 'next/headers'
import {
  authorizeApiRequest,
  buildAccessContext,
  requirePermission,
  requireUser,
} from '../authorization'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))

const fetchMock = vi.fn<typeof fetch>()
let mockBackendResponse = Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 })

const baseUser: Parameters<typeof buildAccessContext>[0] = {
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

function actorResponse(user: Parameters<typeof buildAccessContext>[0] = baseUser) {
  const access = buildAccessContext(user, [])
  return Response.json({ data: {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    roles: access.roles,
    permissions: access.permissions,
    employeeId: user.employeeId,
    mustChangePassword: user.mustChangePassword,
    sessionVersion: user.sessionVersion,
    access: {
      identity: {
        userId: user.id,
        employeeId: user.employeeId,
        employeeDepartmentId: user.employee?.departmentId ?? null,
        memberProjectIds: user.employee?.projectMembers.map((member) => member.projectId) ?? [],
      },
      grants: user.roleAssignments.map((assignment) => ({
        assignmentId: assignment.id,
        role: assignment.role,
        departmentScopeMode: assignment.departmentScopeMode,
        projectScopeMode: assignment.projectScopeMode,
        departmentIds: assignment.departmentScopes.map((scope) => scope.departmentId),
        projectIds: assignment.projectScopes.map((scope) => scope.projectId),
      })),
    },
  } })
}

describe('authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('BACKEND_BASE_URL', 'http://backend:8000')
    vi.stubEnv('BACKEND_PUBLIC_ORIGIN', '')
    fetchMock.mockImplementation(async () => mockBackendResponse.clone())
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(cookies).mockResolvedValue({ toString: () => 'erp_session=session-token' } as never)
    mockBackendResponse = Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 })
  })

  it('rejects a request without a session', async () => {
    await expect(requireUser()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
  })

  it('rejects a user that Python identifies as inactive', async () => {
    mockBackendResponse = Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 })
    await expect(requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })

  it('invalidates a session when Python rejects its stale version', async () => {
    mockBackendResponse = Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 })

    await expect(requireUser()).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
      status: 401,
    })
  })

  it('rejects a legacy cookie not accepted by Python', async () => {
    await expect(requireUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 })
  })

  it('allows only the password endpoint while a password change is required', async () => {
    mockBackendResponse = actorResponse({ ...baseUser, mustChangePassword: true })

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
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts the configured public origin when Next runs behind an internal host', async () => {
    vi.stubEnv('BACKEND_PUBLIC_ORIGIN', 'https://erp.example')
    mockBackendResponse = actorResponse()

    const result = await authorizeApiRequest(
      new NextRequest('http://app:3001/api/assets', {
        method: 'POST',
        headers: { origin: 'https://erp.example' },
      }),
    )

    expect(result.response).toBeUndefined()
    expect(result.user?.id).toBe(baseUser.id)
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

  it('enforces permissions from the actor returned by Python', async () => {
    mockBackendResponse = actorResponse(baseUser)
    await expect(requirePermission('assets.read')).resolves.toMatchObject({
      roles: ['AUDITOR'],
    })
    await expect(requirePermission('assets.update')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    })
  })

  it('does not derive permissions from the legacy role when assignments are empty', async () => {
    mockBackendResponse = actorResponse({
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
