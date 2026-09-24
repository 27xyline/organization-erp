import { AssetInventoryStatus, Prisma, type PrismaClient } from '@prisma/client'
import { getDb } from '@/lib/prisma'
import type { AccessContext } from '@/lib/auth/access-context'
import type {
  AssetInventoryEntriesQuery,
  AssetInventoryListQuery,
  CreateAssetInventoryInput,
  RecordAssetInventoryCountInput,
} from '../contracts/inventory'
import { AssetInventoryError } from '../domain/asset-inventory-error'
import { summarizeAssetInventoryEntries } from '../domain/asset-inventory-summary'

const MAX_INVENTORY_ASSETS = 5_000

function departmentIds(access: AccessContext) {
  return access.allowedDepartmentIds('assets.inventory.manage')
}

async function lockInventory(tx: Prisma.TransactionClient, inventoryId: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "asset_inventories"
    WHERE "id" = ${inventoryId}
    FOR UPDATE
  `)
}

export class AssetInventoryService {
  constructor(private readonly db: PrismaClient = getDb()) {}

  async list(input: AssetInventoryListQuery, access: AccessContext) {
    const ids = departmentIds(access)
    if (ids?.length === 0) return { inventories: [], total: 0 }

    const where: Prisma.AssetInventoryWhereInput = {
      mol: {
        is: {
          departmentRef: { is: { isActive: true } },
          ...(ids ? { departmentId: { in: ids } } : {}),
        },
      },
    }
    const [inventories, total] = await Promise.all([
      this.db.assetInventory.findMany({
        where,
        include: {
          mol: { select: { id: true, code: true, fullName: true, storageLocation: true, department: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { entries: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.db.assetInventory.count({ where }),
    ])

    return { inventories, total }
  }

  async mols(access: AccessContext) {
    const ids = departmentIds(access)
    if (ids && ids.length === 0) return []
    const mols = await this.db.mol.findMany({
      where: {
        departmentRef: { isActive: true },
        ...(ids ? { departmentId: { in: ids } } : {}),
      },
      select: {
        id: true,
        code: true,
        fullName: true,
        storageLocation: true,
        departmentId: true,
        department: true,
      },
      orderBy: { fullName: 'asc' },
    })
    return mols.filter((mol) => access.allows('assets.inventory.manage', { departmentId: mol.departmentId }))
  }

  async create(
    input: CreateAssetInventoryInput,
    actorId: string,
    access: AccessContext,
    requestId?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const mol = await tx.mol.findFirst({
        where: { id: input.molId, departmentRef: { isActive: true } },
        select: { id: true, departmentId: true },
      })
      if (!mol || !access.allows('assets.inventory.manage', { departmentId: mol.departmentId })) {
        throw new AssetInventoryError('MOL_NOT_FOUND')
      }

      const assets = await tx.asset.findMany({
        where: {
          isArchived: false,
          holdings: { some: { molId: mol.id, quantity: { gt: 0 } } },
          AND: [access.assetWhere('assets.read') as Prisma.AssetWhereInput],
        },
        select: {
          id: true,
          inventoryNumber: true,
          name: true,
          unitOfMeasure: true,
          holdings: {
            where: { molId: mol.id, quantity: { gt: 0 } },
            select: { quantity: true },
          },
        },
        orderBy: [{ inventoryNumber: 'asc' }, { id: 'asc' }],
        take: MAX_INVENTORY_ASSETS + 1,
      })

      if (assets.length > MAX_INVENTORY_ASSETS) {
        throw new AssetInventoryError('INVENTORY_TOO_LARGE')
      }
      if (!assets.length) throw new AssetInventoryError('EMPTY_INVENTORY')

      const inventory = await tx.assetInventory.create({
        data: {
          name: input.name,
          molId: mol.id,
          createdById: actorId,
          status: AssetInventoryStatus.IN_PROGRESS,
          entries: {
            create: assets.map((asset) => ({
              assetId: asset.id,
              inventoryNumber: asset.inventoryNumber,
              assetName: asset.name,
              unitOfMeasure: asset.unitOfMeasure,
              expectedQuantity: asset.holdings[0].quantity,
            })),
          },
        },
        include: {
          mol: true,
          createdBy: { select: { id: true, name: true } },
          _count: { select: { entries: true } },
        },
      })

      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'ASSET_INVENTORY_CREATE',
          entityType: 'AssetInventory',
          entityId: inventory.id,
          details: { name: input.name, molId: mol.id, assetCount: assets.length },
          requestId,
        },
      })
      return inventory
    })
  }

  async get(inventoryId: string, query: AssetInventoryEntriesQuery, access: AccessContext) {
    const inventory = await this.db.assetInventory.findUnique({
      where: { id: inventoryId },
      include: {
        mol: { select: { id: true, code: true, fullName: true, storageLocation: true, departmentId: true, department: true } },
        createdBy: { select: { id: true, name: true } },
        entries: {
          include: { scannedBy: { select: { id: true, name: true } } },
          orderBy: [{ inventoryNumber: 'asc' }, { id: 'asc' }],
          take: MAX_INVENTORY_ASSETS + 1,
        },
      },
    })
    if (!inventory || !inventory.mol.departmentId || !access.allows(
      'assets.inventory.manage',
      { departmentId: inventory.mol.departmentId },
    )) {
      throw new AssetInventoryError('INVENTORY_NOT_FOUND')
    }

    const search = query.search?.toLocaleLowerCase('ru-RU')
    const filteredEntries = search
      ? inventory.entries.filter((entry) =>
          entry.inventoryNumber.toLocaleLowerCase('ru-RU').includes(search) ||
          entry.assetName.toLocaleLowerCase('ru-RU').includes(search))
      : inventory.entries
    const start = (query.page - 1) * query.pageSize
    const entries = filteredEntries.slice(start, start + query.pageSize)
    const summary = summarizeAssetInventoryEntries(inventory.entries)

    return {
      inventory: {
        id: inventory.id,
        name: inventory.name,
        status: inventory.status,
        createdAt: inventory.createdAt,
        completedAt: inventory.completedAt,
        mol: inventory.mol,
        createdBy: inventory.createdBy,
      },
      entries,
      summary,
      page: query.page,
      pageSize: query.pageSize,
      total: filteredEntries.length,
      totalPages: Math.ceil(filteredEntries.length / query.pageSize),
    }
  }

  getAct(inventoryId: string, access: AccessContext) {
    return this.get(inventoryId, { page: 1, pageSize: MAX_INVENTORY_ASSETS }, access)
  }

  async resolve(inventoryNumber: string, access: AccessContext) {
    const entries = await this.db.assetInventoryEntry.findMany({
      where: {
        inventoryNumber,
        inventory: { status: AssetInventoryStatus.IN_PROGRESS },
      },
      include: {
        inventory: {
          include: { mol: { select: { id: true, code: true, fullName: true, departmentId: true } } },
        },
      },
      orderBy: { inventory: { createdAt: 'desc' } },
      take: 100,
    })
    return entries
      .filter((entry) => access.allows(
        'assets.inventory.manage',
        { departmentId: entry.inventory.mol.departmentId },
      ))
      .map(({ inventory, ...entry }) => ({
        ...entry,
        inventory: {
          id: inventory.id,
          name: inventory.name,
          mol: inventory.mol,
        },
      }))
  }

  async recordCount(
    inventoryId: string,
    input: RecordAssetInventoryCountInput,
    actorId: string,
    access: AccessContext,
    requestId?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      await lockInventory(tx, inventoryId)
      const inventory = await tx.assetInventory.findUnique({
        where: { id: inventoryId },
        select: { id: true, status: true, mol: { select: { departmentId: true } } },
      })
      if (!inventory || !access.allows(
        'assets.inventory.manage',
        { departmentId: inventory.mol.departmentId },
      )) {
        throw new AssetInventoryError('INVENTORY_NOT_FOUND')
      }
      if (inventory.status !== AssetInventoryStatus.IN_PROGRESS) {
        throw new AssetInventoryError('INVENTORY_COMPLETED')
      }

      const entry = await tx.assetInventoryEntry.findFirst({
        where: { inventoryId, inventoryNumber: input.inventoryNumber },
      })
      if (!entry) throw new AssetInventoryError('ASSET_NOT_IN_INVENTORY')

      const foundQuantity = new Prisma.Decimal(input.foundQuantity)
      const updated = await tx.assetInventoryEntry.update({
        where: { id: entry.id },
        data: {
          foundQuantity,
          note: input.note ?? null,
          scannedById: actorId,
          scannedAt: new Date(),
        },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'ASSET_INVENTORY_SCAN',
          entityType: 'AssetInventoryEntry',
          entityId: entry.id,
          details: {
            inventoryId,
            inventoryNumber: entry.inventoryNumber,
            expectedQuantity: entry.expectedQuantity.toString(),
            foundQuantity: foundQuantity.toString(),
          },
          requestId,
        },
      })
      return updated
    })
  }

  async complete(inventoryId: string, actorId: string, access: AccessContext, requestId?: string) {
    return this.db.$transaction(async (tx) => {
      await lockInventory(tx, inventoryId)
      const inventory = await tx.assetInventory.findUnique({
        where: { id: inventoryId },
        select: { id: true, name: true, status: true, mol: { select: { departmentId: true } } },
      })
      if (!inventory || !access.allows(
        'assets.inventory.manage',
        { departmentId: inventory.mol.departmentId },
      )) {
        throw new AssetInventoryError('INVENTORY_NOT_FOUND')
      }
      if (inventory.status !== AssetInventoryStatus.IN_PROGRESS) {
        throw new AssetInventoryError('INVENTORY_COMPLETED')
      }
      const entryCount = await tx.assetInventoryEntry.count({ where: { inventoryId } })
      if (!entryCount) throw new AssetInventoryError('EMPTY_INVENTORY')

      const completedAt = new Date()
      const completed = await tx.assetInventory.update({
        where: { id: inventoryId },
        data: { status: AssetInventoryStatus.COMPLETED, completedAt },
        include: { mol: true, createdBy: { select: { id: true, name: true } } },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'ASSET_INVENTORY_COMPLETE',
          entityType: 'AssetInventory',
          entityId: inventoryId,
          details: { name: inventory.name, entryCount, completedAt },
          requestId,
        },
      })
      return completed
    })
  }
}

let service: AssetInventoryService | undefined

export function getAssetInventoryService() {
  service ??= new AssetInventoryService()
  return service
}
