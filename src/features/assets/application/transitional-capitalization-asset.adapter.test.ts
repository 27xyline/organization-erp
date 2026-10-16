import { AssetStatus, Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/prisma'
import { createTransitionalCapitalizationAsset } from './transitional-capitalization-asset.adapter'

vi.mock('@/lib/prisma', () => ({ getDb: vi.fn() }))

describe('transitional procurement capitalization adapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates the asset, initial holding, receipt and audit inside its legacy Prisma transaction', async () => {
    const created = {
      id: 'asset-1', inventoryNumber: 'INV-2', name: 'Кабель', quantity: new Prisma.Decimal('3'),
      unitPrice: new Prisma.Decimal('0.1'), totalCost: new Prisma.Decimal('0.3'),
      status: AssetStatus.IN_STOCK, isArchived: false,
    }
    const tx = {
      asset: {
        create: vi.fn().mockResolvedValue(created),
        findUniqueOrThrow: vi.fn().mockResolvedValue(created),
      },
      assetHolding: { create: vi.fn().mockResolvedValue({}) },
      operation: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    }
    const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    vi.mocked(getDb).mockReturnValue({ $transaction: transaction } as never)

    const result = await createTransitionalCapitalizationAsset({
      name: 'Кабель', inventoryNumber: 'INV-2', unitPrice: 0.1, unitOfMeasure: 'шт', quantity: 3,
      molId: 'mol-from', groupId: 'group-1', projectId: null, contractCode: 'C-1', internalFundingCode: 'F-1',
      isExistingAsset: false, recordingDate: '2026-07-16', documentType: 'Накладная', documentDetails: '№ 1',
      documentFiles: [], status: AssetStatus.IN_STOCK, notes: null, plannedDisposalDate: null,
      plannedDisposalReason: null, photos: [], accountingForm: '145',
    }, 'user-1', 'request-1')

    expect(result).toBe(created)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(tx.asset.create.mock.calls[0][0].data.totalCost.toString()).toBe('0.3')
    expect(tx.assetHolding.create.mock.calls[0][0].data.quantity.toString()).toBe('3')
    expect(tx.operation.create.mock.calls[0][0].data).toMatchObject({ type: 'RECEIPT', totalCost: new Prisma.Decimal('0.3') })
    expect(tx.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: 'ASSET_CREATE', entityId: 'asset-1', requestId: 'request-1',
    })
  })
})
