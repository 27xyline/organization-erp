import type { PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { ProcurementService } from './procurement.service'

describe('ProcurementService.list', () => {
  it('paginates by the requested page and filters approval-derived approved status', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const count = vi.fn()
      .mockResolvedValueOnce(110)
      .mockResolvedValueOnce(70)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2)
    const aggregate = vi.fn().mockResolvedValue({ _sum: { budgetLimit: '450000.00' } })
    const transaction = vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries))
    const db = {
      procurementRequest: { findMany, count, aggregate },
      $transaction: transaction,
    } as unknown as PrismaClient

    const result = await new ProcurementService(db).list({
      page: 5, pageSize: 25, search: 'ноутбук', status: 'APPROVED',
    })

    const search = {
      OR: [
        { number: { contains: 'ноутбук', mode: 'insensitive' } },
        { title: { contains: 'ноутбук', mode: 'insensitive' } },
        { contract: { number: { contains: 'ноутбук', mode: 'insensitive' } } },
        { contract: { supplier: { name: { contains: 'ноутбук', mode: 'insensitive' } } } },
      ],
    }
    const approved = {
      OR: [
        { status: 'APPROVED' },
        { status: 'SUBMITTED', approvalRequest: { is: { status: 'APPROVED' } } },
      ],
    }
    const where = { AND: [search, approved] }
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where,
      skip: 100,
      take: 25,
    }))
    expect(count).toHaveBeenNthCalledWith(1, { where })
    expect(aggregate).toHaveBeenCalledWith({ where, _sum: { budgetLimit: true } })
    expect(result).toEqual({
      requests: [], total: 110,
      summary: { active: 70, awaiting: 0, overdue: 2, budget: 450000 },
    })
  })

  it('treats a submitted request as awaiting only until its approval reaches a terminal state', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const count = vi.fn().mockResolvedValue(0)
    const aggregate = vi.fn().mockResolvedValue({ _sum: { budgetLimit: null } })
    const transaction = vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries))
    const db = {
      procurementRequest: { findMany, count, aggregate },
      $transaction: transaction,
    } as unknown as PrismaClient

    await new ProcurementService(db).list({ page: 1, pageSize: 25, status: 'SUBMITTED' })

    expect(findMany.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      where: { AND: [
        {},
        {
          status: 'SUBMITTED',
          NOT: { approvalRequest: { is: { status: { in: ['APPROVED', 'REJECTED', 'CANCELLED'] } } } },
        },
      ] },
    }))
  })
})
