import { AssetStatus, Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/prisma'
import { AssetService, AssetServiceError } from '../asset.service'

vi.mock('@/lib/prisma', () => ({ getDb: vi.fn() }))

const baseAsset = {
  id: 'asset-1',
  inventoryNumber: 'INV-1',
  name: 'Ноутбук',
  quantity: new Prisma.Decimal('10'),
  unitPrice: new Prisma.Decimal('1250.55'),
  totalCost: new Prisma.Decimal('12505.50'),
  status: AssetStatus.IN_STOCK,
  isArchived: false,
  molId: 'mol-from',
}

function createTransactionMock() {
  return {
    asset: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    assetHolding: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    mol: { findUnique: vi.fn() },
    operation: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
}

function useTransaction(tx: ReturnType<typeof createTransactionMock>) {
  const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
  vi.mocked(getDb).mockReturnValue({ $transaction: transaction } as never)
  return transaction
}

const createInput = {
  name: 'Кабель',
  inventoryNumber: 'INV-2',
  unitPrice: 0.1,
  unitOfMeasure: 'шт',
  quantity: 3,
  molId: 'mol-from',
  groupId: 'group-1',
  projectId: null,
  contractCode: 'C-1',
  internalFundingCode: 'F-1',
  isExistingAsset: false,
  recordingDate: '2026-07-16',
  documentType: 'Накладная',
  documentDetails: '№ 1',
  documentFiles: [],
  status: AssetStatus.IN_STOCK,
  notes: null,
  plannedDisposalDate: null,
  plannedDisposalReason: null,
  photos: [],
  accountingForm: '145' as const,
}

const transferInput = {
  fromMolId: 'mol-from',
  toMolId: 'mol-to',
  quantity: 4,
  date: new Date('2026-07-16T12:00:00.000Z'),
  reason: 'Передача в отдел',
  documentType: 'Акт передачи',
  documentDetails: '№ 2',
  documentFiles: [],
}

describe('AssetService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates the asset, initial holding, receipt and audit in one transaction using Decimal', async () => {
    const tx = createTransactionMock()
    useTransaction(tx)
    const created = {
      ...baseAsset,
      name: createInput.name,
      inventoryNumber: createInput.inventoryNumber,
      quantity: new Prisma.Decimal('3'),
      unitPrice: new Prisma.Decimal('0.1'),
      totalCost: new Prisma.Decimal('0.3'),
    }
    tx.asset.create.mockResolvedValue(created)
    tx.asset.findUniqueOrThrow.mockResolvedValue(created)
    tx.assetHolding.create.mockResolvedValue({})
    tx.operation.create.mockResolvedValue({ id: 'operation-1' })
    tx.auditLog.create.mockResolvedValue({})

    await AssetService.create(createInput, 'user-1')

    expect(tx.asset.create.mock.calls[0][0].data.totalCost.toString()).toBe('0.3')
    expect(tx.assetHolding.create.mock.calls[0][0].data.quantity.toString()).toBe('3')
    expect(tx.operation.create.mock.calls[0][0].data.totalCost.toString()).toBe('0.3')
    expect(tx.auditLog).toBeDefined()
  })

  it('moves only the requested quantity and keeps the aggregate asset unchanged', async () => {
    const tx = createTransactionMock()
    useTransaction(tx)
    tx.asset.findUnique.mockResolvedValue(baseAsset)
    tx.mol.findUnique.mockResolvedValue({ id: 'mol-to' })
    tx.assetHolding.findUnique.mockResolvedValue({
      id: 'holding-from', assetId: baseAsset.id, molId: 'mol-from', quantity: new Prisma.Decimal('10'),
    })
    tx.assetHolding.updateMany.mockResolvedValue({ count: 1 })
    tx.assetHolding.upsert.mockResolvedValue({})
    tx.assetHolding.deleteMany.mockResolvedValue({ count: 0 })
    tx.operation.create.mockResolvedValue({ id: 'operation-1' })
    tx.auditLog.create.mockResolvedValue({})
    tx.asset.findUniqueOrThrow.mockResolvedValue(baseAsset)

    await AssetService.transfer(baseAsset.id, transferInput, 'user-1')

    expect(tx.assetHolding.updateMany.mock.calls[0][0].data.quantity.decrement.toString()).toBe('4')
    expect(tx.assetHolding.upsert.mock.calls[0][0].update.quantity.increment.toString()).toBe('4')
    expect(tx.operation.create.mock.calls[0][0].data.totalCost.toString()).toBe('5002.2')
    expect(tx.asset.update).not.toHaveBeenCalled()
  })

  it('updates the temporary legacy molId after a full transfer without archiving the asset', async () => {
    const tx = createTransactionMock()
    useTransaction(tx)
    tx.asset.findUnique.mockResolvedValue({ ...baseAsset, quantity: new Prisma.Decimal('4') })
    tx.mol.findUnique.mockResolvedValue({ id: 'mol-to' })
    tx.assetHolding.findUnique.mockResolvedValue({
      id: 'holding-from', assetId: baseAsset.id, molId: 'mol-from', quantity: new Prisma.Decimal('4'),
    })
    tx.assetHolding.updateMany.mockResolvedValue({ count: 1 })
    tx.assetHolding.upsert.mockResolvedValue({})
    tx.assetHolding.deleteMany.mockResolvedValue({ count: 1 })
    tx.asset.update.mockResolvedValue({})
    tx.operation.create.mockResolvedValue({ id: 'operation-1' })
    tx.auditLog.create.mockResolvedValue({})
    tx.asset.findUniqueOrThrow.mockResolvedValue(baseAsset)

    await AssetService.transfer(baseAsset.id, transferInput, 'user-1')

    expect(tx.asset.update).toHaveBeenCalledWith({
      where: { id: baseAsset.id }, data: { molId: 'mol-to' },
    })
    expect(tx.asset.update.mock.calls[0][0].data).not.toHaveProperty('isArchived')
  })

  it('rejects an insufficient source balance before writing holdings', async () => {
    const tx = createTransactionMock()
    useTransaction(tx)
    tx.asset.findUnique.mockResolvedValue(baseAsset)
    tx.mol.findUnique.mockResolvedValue({ id: 'mol-to' })
    tx.assetHolding.findUnique.mockResolvedValue({
      id: 'holding-from', assetId: baseAsset.id, molId: 'mol-from', quantity: new Prisma.Decimal('2'),
    })

    await expect(AssetService.transfer(baseAsset.id, transferInput, 'user-1'))
      .rejects.toEqual(new AssetServiceError('INSUFFICIENT_QUANTITY'))
    expect(tx.assetHolding.updateMany).not.toHaveBeenCalled()
    expect(tx.operation.create).not.toHaveBeenCalled()
  })

  it('fully disposes and archives only when the aggregate quantity reaches zero', async () => {
    const tx = createTransactionMock()
    useTransaction(tx)
    const asset = { ...baseAsset, quantity: new Prisma.Decimal('4'), totalCost: new Prisma.Decimal('5002.2') }
    tx.asset.findUnique.mockResolvedValue(asset)
    tx.assetHolding.findUnique.mockResolvedValue({
      id: 'holding-from', assetId: asset.id, molId: 'mol-from', quantity: new Prisma.Decimal('4'),
    })
    tx.assetHolding.updateMany.mockResolvedValue({ count: 1 })
    tx.assetHolding.deleteMany.mockResolvedValue({ count: 1 })
    tx.asset.update.mockImplementation(async ({ data }) => ({ ...asset, ...data }))
    tx.operation.create.mockResolvedValue({ id: 'operation-1' })
    tx.auditLog.create.mockResolvedValue({})
    tx.assetHolding.findMany.mockResolvedValue([])

    await AssetService.dispose(asset.id, {
      fromMolId: 'mol-from', quantity: 4, date: new Date('2026-07-16'), reason: 'Списание',
      documentType: 'Акт', documentDetails: '№ 3', documentFiles: [],
    }, 'user-1')

    expect(tx.asset.update.mock.calls[0][0].data).toMatchObject({
      status: AssetStatus.FULLY_DISPOSED,
      isArchived: true,
    })
    expect(tx.asset.update.mock.calls[0][0].data.quantity.toString()).toBe('0')
    expect(tx.asset.update.mock.calls[0][0].data.totalCost.toString()).toBe('0')
  })

  it('retries a serialization conflict and commits the second attempt', async () => {
    const tx = createTransactionMock()
    tx.asset.findUnique.mockResolvedValue(baseAsset)
    tx.asset.update.mockResolvedValue({ ...baseAsset, isArchived: true })
    tx.operation.create.mockResolvedValue({ id: 'operation-1' })
    tx.auditLog.create.mockResolvedValue({})
    const conflict = new Prisma.PrismaClientKnownRequestError('write conflict', {
      code: 'P2034', clientVersion: '6.19.3',
    })
    const transaction = vi.fn()
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    vi.mocked(getDb).mockReturnValue({ $transaction: transaction } as never)

    await AssetService.archive(baseAsset.id, 'Проверка', 'user-1')

    expect(transaction).toHaveBeenCalledTimes(2)
    expect(tx.auditLog.create).toHaveBeenCalledOnce()
  })
})
