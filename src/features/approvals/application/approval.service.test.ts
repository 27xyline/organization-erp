import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { ApprovalService } from './approval.service'

describe('ApprovalService.listPendingForUser', () => {
  it('returns only currently pending steps assigned to the user', async () => {
    const requests = [{
      id: 'approval-1',
      title: 'Согласовать смету',
      currentStep: 2,
      dueAt: new Date('2026-10-01T00:00:00.000Z'),
      requestedBy: { name: 'Инициатор' },
      steps: [{ sequence: 2, name: 'Финансовая проверка', approverId: 'approver-42' }],
    }]
    const findMany = vi.fn().mockResolvedValue(requests)
    const count = vi.fn().mockResolvedValue(7)
    const transaction = vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries))
    const db = {
      approvalRequest: { findMany, count },
      $transaction: transaction,
    } as unknown as PrismaClient

    const result = await new ApprovalService(db).listPendingForUser('approver-42', 5)

    const where = {
      status: 'PENDING',
      steps: { some: { approverId: 'approver-42', status: 'PENDING' } },
    }
    expect(findMany).toHaveBeenCalledWith({
      where,
      select: {
        id: true,
        title: true,
        currentStep: true,
        dueAt: true,
        requestedBy: { select: { name: true } },
        steps: {
          where: { approverId: 'approver-42', status: 'PENDING' },
          select: { sequence: true, name: true, approverId: true },
        },
      },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 5,
    })
    expect(count).toHaveBeenCalledWith({ where })
    expect(result).toEqual({
      requests: [{
        id: 'approval-1',
        title: 'Согласовать смету',
        dueAt: new Date('2026-10-01T00:00:00.000Z'),
        requestedBy: { name: 'Инициатор' },
        step: { sequence: 2, name: 'Финансовая проверка' },
      }],
      total: 7,
    })
  })
})
