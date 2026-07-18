import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hash, verify } from '@node-rs/argon2'
import { getDb } from '@/lib/prisma'
import { UserService } from './user.service'

vi.mock('@node-rs/argon2', () => ({
  hash: vi.fn(async () => 'new-password-hash'),
  verify: vi.fn(async () => true),
}))
vi.mock('@/lib/prisma', () => ({ getDb: vi.fn() }))

const queryRaw = vi.fn(async () => [{ pg_advisory_xact_lock: null }])
const findUser = vi.fn()
const countUsers = vi.fn()
const updateUser = vi.fn()
const createAudit = vi.fn(async () => ({}))

const tx = {
  $queryRaw: queryRaw,
  user: {
    findUnique: findUser,
    count: countUsers,
    update: updateUser,
  },
  department: { count: vi.fn(async () => 0) },
  project: { count: vi.fn(async () => 0) },
  employee: { count: vi.fn(async () => 0) },
  auditLog: { create: createAudit },
}

const transaction = vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
const dbFindUser = vi.fn()

const currentAdmin = {
  id: 'admin-1',
  username: 'admin',
  name: 'Admin',
  role: 'ADMIN',
  employeeId: null,
  employee: null,
  roleAssignments: [{
    id: 'assignment-admin',
    role: 'ADMIN',
    departmentScopeMode: 'ALL',
    projectScopeMode: 'ALL',
    departmentScopes: [],
    projectScopes: [],
  }],
  isActive: true,
  mustChangePassword: false,
  lockedUntil: null,
  lastLoginAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
}

const auditorAssignment = {
  role: 'AUDITOR' as const,
  departmentScopeMode: 'ALL' as const,
  projectScopeMode: 'ALL' as const,
  departmentIds: [],
  projectIds: [],
}

describe('UserService security invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getDb).mockReturnValue({
      $transaction: transaction,
      user: { findUnique: dbFindUser },
    } as never)
    findUser.mockResolvedValue(currentAdmin)
    updateUser.mockResolvedValue(currentAdmin)
  })

  it('takes a transaction-scoped advisory lock before checking the last ADMIN', async () => {
    countUsers.mockResolvedValue(1)

    await expect(UserService.update(
      currentAdmin.id,
      { assignments: [auditorAssignment] },
      'operator-1',
    )).rejects.toMatchObject({ code: 'LAST_ADMIN_REQUIRED' })

    expect(queryRaw).toHaveBeenCalledOnce()
    expect(countUsers).toHaveBeenCalledWith({
      where: {
        isActive: true,
        roleAssignments: { some: { role: 'ADMIN' } },
      },
    })
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      countUsers.mock.invocationCallOrder[0],
    )
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('does not treat an inactive ADMIN assignment as an active administrator removal', async () => {
    findUser.mockResolvedValue({ ...currentAdmin, isActive: false })
    updateUser.mockResolvedValue({ ...currentAdmin, isActive: false })

    await UserService.update(
      currentAdmin.id,
      { assignments: [auditorAssignment] },
      'operator-1',
    )

    expect(countUsers).not.toHaveBeenCalled()
    expect(updateUser).toHaveBeenCalledOnce()
  })

  it('invalidates existing sessions when an administrator resets a password', async () => {
    findUser.mockResolvedValue({
      ...currentAdmin,
      role: 'VIEWER',
      roleAssignments: [{
        id: 'assignment-auditor',
        ...auditorAssignment,
        departmentScopes: [],
        projectScopes: [],
      }],
    })
    updateUser.mockResolvedValue(currentAdmin)

    await UserService.update(
      currentAdmin.id,
      { temporaryPassword: 'temporary-password' },
      'operator-1',
    )

    expect(hash).toHaveBeenCalledWith('temporary-password')
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: currentAdmin.id },
      data: expect.objectContaining({
        passwordHash: 'new-password-hash',
        mustChangePassword: true,
        sessionVersion: { increment: 1 },
        passwordChangedAt: expect.any(Date),
      }),
    }))
  })

  it('invalidates the current session after a successful self-service password change', async () => {
    dbFindUser.mockResolvedValue({
      id: 'user-1',
      passwordHash: 'current-password-hash',
    })

    await UserService.changePassword('user-1', {
      currentPassword: 'current-password',
      newPassword: 'new-password',
    })

    expect(verify).toHaveBeenCalledWith('current-password-hash', 'current-password')
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        passwordHash: 'new-password-hash',
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
        passwordChangedAt: expect.any(Date),
      }),
    })
  })
})
