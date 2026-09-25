import type { PrismaClient } from '@prisma/client'
import type { CurrentUser } from '@/lib/auth/authorization'
import { describe, expect, it, vi } from 'vitest'
import { MyActionsService } from './my-actions.service'

function user(access: Record<string, unknown>) {
  return {
    id: 'user-1', access: {
      identity: { employeeId: 'employee-1' },
      has: vi.fn((permission: string) => permission === 'tasks.read' || permission === 'approvals.decide'),
      projectWhere: vi.fn(() => ({ id: { in: ['project-1'] } })),
      allowedDepartmentIds: vi.fn(() => []),
      ...access,
    },
  } as unknown as CurrentUser
}

describe('MyActionsService', () => {
  it('queries assigned tasks within project scope and only current-user approval steps', async () => {
    const taskFindMany = vi.fn().mockResolvedValue([{
      id: 'task-1', name: 'Подготовить акт', priority: 'HIGH', endDate: new Date('2026-09-26T00:00:00Z'),
      projectId: 'project-1', project: { code: 'P-1' },
    }])
    const taskCount = vi.fn().mockResolvedValue(1)
    const approvalFindMany = vi.fn().mockResolvedValue([{
      id: 'approval-1', title: 'Согласовать закупку', dueAt: null, currentStep: 2,
      steps: [{ sequence: 2, name: 'Руководитель' }],
    }])
    const db = {
      task: { findMany: taskFindMany, count: taskCount },
      approvalRequest: { findMany: approvalFindMany },
      assetInventoryEntry: { fields: { expectedQuantity: 'expectedQuantity' }, findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      employee: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient
    const actor = user({})

    const result = await new MyActionsService(db).getForUser(actor, new Date('2026-09-25T00:00:00Z'))

    expect(taskFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        assignees: { some: { employeeId: 'employee-1' } },
        project: { is: { id: { in: ['project-1'] } } },
      }),
    }))
    expect(approvalFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'PENDING',
        steps: { some: { approverId: 'user-1', status: 'PENDING' } },
      },
    }))
    expect(result.items.map((action) => action.href)).toContain('/approvals/approval-1')
    expect(result.total).toBe(2)
  })

  it('does not query organization tasks or approvals when the employee has no personal access', async () => {
    const findMany = vi.fn()
    const count = vi.fn()
    const db = {
      task: { findMany, count },
      approvalRequest: { findMany },
      assetInventoryEntry: { fields: { expectedQuantity: 'expectedQuantity' }, findMany, count },
      employee: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient
    const actor = {
      id: 'admin-1', access: {
        identity: { employeeId: null },
        has: vi.fn((permission: string) => permission === 'tasks.read' || permission === 'approvals.read'),
        projectWhere: vi.fn(() => ({})),
        allowedDepartmentIds: vi.fn(() => null),
      },
    } as unknown as CurrentUser

    const result = await new MyActionsService(db).getForUser(actor)

    expect(findMany).not.toHaveBeenCalled()
    expect(count).not.toHaveBeenCalled()
    expect(result).toEqual({ items: [], total: 0 })
  })
})
