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

describe('ApprovalService approval templates', () => {
  it('lists active templates for requesters and includes archived templates for managers', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const db = { approvalTemplate: { findMany } } as unknown as PrismaClient
    const service = new ApprovalService(db)

    await service.listTemplates(false)
    await service.listTemplates(true)

    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: { isActive: true },
      select: { id: true, name: true, steps: true, isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: {},
      select: { id: true, name: true, steps: true, isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
  })

  it('validates active approvers and saves the full route under its creator', async () => {
    const template = { id: 'template-1', name: 'Закупка', isActive: true }
    const count = vi.fn().mockResolvedValue(2)
    const create = vi.fn().mockResolvedValue(template)
    const auditCreate = vi.fn().mockResolvedValue({})
    const tx = { user: { count }, approvalTemplate: { create }, auditLog: { create: auditCreate } }
    const transaction = vi.fn(async (callback: unknown) =>
      (callback as (client: typeof tx) => Promise<unknown>)(tx)
    )
    const db = { $transaction: transaction } as unknown as PrismaClient
    const steps = [
      { name: 'Руководитель', approverId: 'user-1' },
      { name: 'Финансы', approverId: 'user-2' },
    ]

    await expect(new ApprovalService(db).createTemplate({ name: 'Закупка', steps }, 'admin-1', 'request-1'))
      .resolves.toEqual(template)

    expect(count).toHaveBeenCalledWith({
      where: { id: { in: ['user-1', 'user-2'] }, isActive: true },
    })
    expect(create).toHaveBeenCalledWith({
      data: { name: 'Закупка', steps, isActive: true, createdById: 'admin-1' },
      select: { id: true, name: true, steps: true, isActive: true },
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'APPROVAL_TEMPLATE_CREATE',
        entityType: 'ApprovalTemplate',
        entityId: 'template-1',
        details: { name: 'Закупка', stepCount: 2 },
        requestId: 'request-1',
      },
    })
  })

  it('refuses a route containing an inactive or missing approver', async () => {
    const count = vi.fn().mockResolvedValue(1)
    const transaction = vi.fn()
    const tx = { user: { count } }
    transaction.mockImplementation(async (callback: unknown) =>
      (callback as (client: typeof tx) => Promise<unknown>)(tx)
    )
    const db = { $transaction: transaction } as unknown as PrismaClient

    await expect(new ApprovalService(db).createTemplate({
      name: 'Закупка',
      steps: [
        { name: 'Руководитель', approverId: 'user-1' },
        { name: 'Финансы', approverId: 'user-2' },
      ],
    }, 'admin-1')).rejects.toMatchObject({ code: 'INVALID_APPROVER' })

    expect(transaction).toHaveBeenCalledOnce()
  })

  it('updates only supplied fields and can restore an archived route', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'template-1', name: 'Закупка', isActive: true })
    const auditCreate = vi.fn().mockResolvedValue({})
    const tx = { approvalTemplate: { update }, auditLog: { create: auditCreate } }
    const transaction = vi.fn(async (callback: unknown) =>
      (callback as (client: typeof tx) => Promise<unknown>)(tx)
    )
    const db = { $transaction: transaction } as unknown as PrismaClient

    await expect(new ApprovalService(db).updateTemplate('template-1', { isActive: true }, 'admin-1'))
      .resolves.toMatchObject({ isActive: true })

    expect(update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: { isActive: true },
      select: { id: true, name: true, steps: true, isActive: true },
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'APPROVAL_TEMPLATE_UPDATE',
        entityType: 'ApprovalTemplate',
        entityId: 'template-1',
        details: { name: 'Закупка', isActive: true },
        requestId: undefined,
      },
    })
  })
})
