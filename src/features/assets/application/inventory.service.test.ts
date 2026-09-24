import { Prisma, type PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { AccessContext } from '@/lib/auth/access-context'
import { AssetInventoryService } from './inventory.service'

function access(allows = true) {
  return {
    allows: vi.fn(() => allows),
    allowedDepartmentIds: vi.fn(() => ['department-1']),
    assetWhere: vi.fn(() => ({ id: { not: '__hidden__' } })),
  } as unknown as AccessContext
}

describe('AssetInventoryService', () => {
  it('snapshots only active holdings at one accessible responsible storage location', async () => {
    const mol = { id: 'mol-1', departmentId: 'department-1', isActiveDepartment: true }
    const assets = [{
      id: 'asset-1',
      inventoryNumber: 'INV-101',
      name: 'Ноутбук',
      unitOfMeasure: 'шт.',
      holdings: [{ quantity: new Prisma.Decimal('2.00') }],
    }]
    const findFirst = vi.fn().mockResolvedValue(mol)
    const findMany = vi.fn().mockResolvedValue(assets)
    const create = vi.fn().mockResolvedValue({ id: 'inventory-1', name: 'Проверка' })
    const auditCreate = vi.fn().mockResolvedValue({})
    const tx = {
      mol: { findFirst },
      asset: { findMany },
      assetInventory: { create },
      auditLog: { create: auditCreate },
    }
    const transaction = vi.fn(async (callback: unknown) =>
      (callback as (client: typeof tx) => Promise<unknown>)(tx)
    )
    const db = { $transaction: transaction } as unknown as PrismaClient
    const permission = access()

    await expect(new AssetInventoryService(db).create(
      { name: 'Проверка', molId: 'mol-1' }, 'user-1', permission, 'request-1',
    )).resolves.toEqual({ id: 'inventory-1', name: 'Проверка' })

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'mol-1', departmentRef: { isActive: true } },
      select: { id: true, departmentId: true },
    })
    expect(permission.allows).toHaveBeenCalledWith('assets.inventory.manage', { departmentId: 'department-1' })
    expect(findMany).toHaveBeenCalledWith({
      where: {
        isArchived: false,
        holdings: { some: { molId: 'mol-1', quantity: { gt: 0 } } },
        AND: [{ id: { not: '__hidden__' } }],
      },
      select: {
        id: true,
        inventoryNumber: true,
        name: true,
        unitOfMeasure: true,
        holdings: {
          where: { molId: 'mol-1', quantity: { gt: 0 } },
          select: { quantity: true },
        },
      },
      orderBy: [{ inventoryNumber: 'asc' }, { id: 'asc' }],
      take: 5001,
    })
    expect(create).toHaveBeenCalledWith({
      data: {
        name: 'Проверка',
        molId: 'mol-1',
        createdById: 'user-1',
        status: 'IN_PROGRESS',
        entries: {
          create: [{
            assetId: 'asset-1',
            inventoryNumber: 'INV-101',
            assetName: 'Ноутбук',
            unitOfMeasure: 'шт.',
            expectedQuantity: new Prisma.Decimal('2.00'),
          }],
        },
      },
      include: {
        mol: true,
        createdBy: { select: { id: true, name: true } },
        _count: { select: { entries: true } },
      },
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'ASSET_INVENTORY_CREATE',
        entityType: 'AssetInventory',
        entityId: 'inventory-1',
        details: { name: 'Проверка', molId: 'mol-1', assetCount: 1 },
        requestId: 'request-1',
      },
    })
  })

  it('records a count against the snapshotted asset and never adjusts the ledger', async () => {
    const session = { id: 'inventory-1', status: 'IN_PROGRESS', mol: { departmentId: 'department-1' } }
    const current = {
      id: 'entry-1', inventoryNumber: 'INV-101', assetName: 'Ноутбук',
      expectedQuantity: new Prisma.Decimal('2.00'), foundQuantity: null,
    }
    const updated = { ...current, foundQuantity: new Prisma.Decimal('1.00'), scannedAt: new Date('2026-09-24T10:00:00Z') }
    const findUnique = vi.fn().mockResolvedValue(session)
    const findFirst = vi.fn().mockResolvedValue(current)
    const update = vi.fn().mockResolvedValue(updated)
    const auditCreate = vi.fn().mockResolvedValue({})
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      assetInventory: { findUnique },
      assetInventoryEntry: { findFirst, update },
      auditLog: { create: auditCreate },
    }
    const transaction = vi.fn(async (callback: unknown) =>
      (callback as (client: typeof tx) => Promise<unknown>)(tx)
    )
    const db = { $transaction: transaction } as unknown as PrismaClient

    await expect(new AssetInventoryService(db).recordCount(
      'inventory-1',
      { inventoryNumber: 'INV-101', foundQuantity: 1, note: 'Одного не хватает' },
      'user-1', access(), 'request-2',
    )).resolves.toEqual(updated)

    expect(tx.$queryRaw).toHaveBeenCalledOnce()
    expect(findFirst).toHaveBeenCalledWith({
      where: { inventoryId: 'inventory-1', inventoryNumber: 'INV-101' },
    })
    expect(update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: {
        foundQuantity: new Prisma.Decimal('1'),
        note: 'Одного не хватает',
        scannedById: 'user-1',
        scannedAt: expect.any(Date),
      },
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'ASSET_INVENTORY_SCAN',
        entityType: 'AssetInventoryEntry',
        entityId: 'entry-1',
        details: {
          inventoryId: 'inventory-1',
          inventoryNumber: 'INV-101',
          expectedQuantity: '2',
          foundQuantity: '1',
        },
        requestId: 'request-2',
      },
    })
    expect(Object.hasOwn(tx, 'asset')).toBe(false)
    expect(Object.hasOwn(tx, 'assetHolding')).toBe(false)
  })

  it('does not reveal a session when its responsible location is outside the user scope', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'inventory-1', status: 'IN_PROGRESS', mol: { departmentId: 'department-2' },
    })
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      assetInventory: { findUnique },
      assetInventoryEntry: { findFirst: vi.fn() },
    }
    const transaction = vi.fn(async (callback: unknown) =>
      (callback as (client: typeof tx) => Promise<unknown>)(tx)
    )
    const db = { $transaction: transaction } as unknown as PrismaClient

    await expect(new AssetInventoryService(db).recordCount(
      'inventory-1',
      { inventoryNumber: 'INV-101', foundQuantity: 1 },
      'user-1', access(false),
    )).rejects.toMatchObject({ code: 'INVENTORY_NOT_FOUND' })
    expect(tx.assetInventoryEntry.findFirst).not.toHaveBeenCalled()
  })

  it('completes an inventory as a report and leaves accounting models untouched', async () => {
    const current = {
      id: 'inventory-1', name: 'Проверка', status: 'IN_PROGRESS',
      mol: { departmentId: 'department-1' },
    }
    const completed = { ...current, status: 'COMPLETED', completedAt: new Date('2026-09-24T12:00:00Z') }
    const findUnique = vi.fn().mockResolvedValue(current)
    const count = vi.fn().mockResolvedValue(3)
    const update = vi.fn().mockResolvedValue(completed)
    const auditCreate = vi.fn().mockResolvedValue({})
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      assetInventory: { findUnique, update },
      assetInventoryEntry: { count },
      auditLog: { create: auditCreate },
    }
    const transaction = vi.fn(async (callback: unknown) =>
      (callback as (client: typeof tx) => Promise<unknown>)(tx)
    )
    const db = { $transaction: transaction } as unknown as PrismaClient

    await expect(new AssetInventoryService(db).complete(
      'inventory-1', 'user-1', access(), 'request-3',
    )).resolves.toBe(completed)

    expect(tx.$queryRaw).toHaveBeenCalledOnce()
    expect(count).toHaveBeenCalledWith({ where: { inventoryId: 'inventory-1' } })
    expect(update).toHaveBeenCalledWith({
      where: { id: 'inventory-1' },
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
      include: { mol: true, createdBy: { select: { id: true, name: true } } },
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'ASSET_INVENTORY_COMPLETE',
        entityType: 'AssetInventory',
        entityId: 'inventory-1',
        details: { name: 'Проверка', entryCount: 3, completedAt: expect.any(Date) },
        requestId: 'request-3',
      },
    })
    expect(Object.hasOwn(tx, 'asset')).toBe(false)
    expect(Object.hasOwn(tx, 'assetHolding')).toBe(false)
    expect(Object.hasOwn(tx, 'operation')).toBe(false)
  })
})
