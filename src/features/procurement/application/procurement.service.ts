import {
  ApprovalRequestStatus,
  Prisma,
  ProcurementStatus,
  type PrismaClient,
} from '@prisma/client'
import type { CreateApprovalInput } from '@/features/approvals/contracts/approval'
import type { CreateAssetInput } from '@/features/assets/contracts/schemas'
import { getDb } from '@/lib/prisma'
import type {
  CapitalizeDeliveryItemInput,
  CreateContractInput,
  CreateDeliveryInput,
  CreateProcurementInput,
  CreateSupplierInput,
  ProcurementQuery,
  SubmitProcurementInput,
  UpdateProcurementInput,
} from '../contracts/procurement'

export type ProcurementErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'REFERENCE_NOT_FOUND'
  | 'BUDGET_EXCEEDED'
  | 'DELIVERY_EXCEEDED'
  | 'ALREADY_CAPITALIZED'

export class ProcurementError extends Error {
  constructor(public readonly code: ProcurementErrorCode) {
    super(code)
    this.name = 'ProcurementError'
  }
}

const include = {
  project: { select: { id: true, code: true, name: true } },
  requestedBy: { select: { id: true, name: true } },
  document: { select: { id: true, title: true, status: true } },
  approvalRequest: {
    select: { id: true, status: true, currentStep: true },
  },
  items: {
    include: {
      group: { select: { id: true, code: true, name: true } },
      deliveryItems: {
        select: { id: true, quantity: true, assetId: true },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  contract: {
    include: {
      supplier: true,
      document: { select: { id: true, title: true, status: true } },
    },
  },
  deliveries: {
    include: {
      document: { select: { id: true, title: true, status: true } },
      items: {
        include: {
          procurementItem: { select: { id: true, name: true, unit: true, unitPrice: true } },
          asset: { select: { id: true, inventoryNumber: true, name: true } },
        },
      },
    },
    orderBy: { receivedAt: 'desc' as const },
  },
} satisfies Prisma.ProcurementRequestInclude

type ProcurementWithRelations = Prisma.ProcurementRequestGetPayload<{ include: typeof include }>
type CreateApproval = (input: CreateApprovalInput) => Promise<{ id: string }>
type CreateAsset = (input: CreateAssetInput) => Promise<{ id: string; inventoryNumber: string }>

function effectiveStatus(request: ProcurementWithRelations) {
  if (request.status !== ProcurementStatus.SUBMITTED) return request.status
  if (request.approvalRequest?.status === ApprovalRequestStatus.APPROVED) return ProcurementStatus.APPROVED
  if (request.approvalRequest?.status === ApprovalRequestStatus.REJECTED) return ProcurementStatus.REJECTED
  if (request.approvalRequest?.status === ApprovalRequestStatus.CANCELLED) return ProcurementStatus.CANCELLED
  return request.status
}

function serialize(request: ProcurementWithRelations) {
  return {
    ...request,
    status: effectiveStatus(request),
    budgetLimit: Number(request.budgetLimit),
    totalPlanned: request.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
      0,
    ),
    items: request.items.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      deliveredQuantity: item.deliveryItems.reduce(
        (sum, deliveryItem) => sum + Number(deliveryItem.quantity),
        0,
      ),
      deliveryItems: item.deliveryItems.map((deliveryItem) => ({
        ...deliveryItem,
        quantity: Number(deliveryItem.quantity),
      })),
    })),
    contract: request.contract
      ? { ...request.contract, amount: Number(request.contract.amount) }
      : null,
    deliveries: request.deliveries.map((delivery) => ({
      ...delivery,
      items: delivery.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        procurementItem: {
          ...item.procurementItem,
          unitPrice: Number(item.procurementItem.unitPrice),
        },
      })),
    })),
  }
}

export class ProcurementService {
  constructor(private readonly db: PrismaClient = getDb()) {}

  async list(query: ProcurementQuery) {
    const where: Prisma.ProcurementRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
          OR: [
            { number: { contains: query.search, mode: 'insensitive' } },
            { title: { contains: query.search, mode: 'insensitive' } },
            { contract: { number: { contains: query.search, mode: 'insensitive' } } },
            { contract: { supplier: { name: { contains: query.search, mode: 'insensitive' } } } },
          ],
        }
        : {}),
    }
    const [requests, total] = await this.db.$transaction([
      this.db.procurementRequest.findMany({
        where,
        include,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.procurementRequest.count({ where }),
    ])
    return { requests: requests.map(serialize), total }
  }

  async get(id: string) {
    const request = await this.db.procurementRequest.findUnique({ where: { id }, include })
    if (!request) throw new ProcurementError('NOT_FOUND')
    return serialize(request)
  }

  async options(includeDocuments = false) {
    const [projects, suppliers, approvers, groups, mols, documents] = await Promise.all([
      this.db.project.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.db.supplier.findMany({
        where: { isActive: true },
        select: { id: true, name: true, taxId: true },
        orderBy: { name: 'asc' },
      }),
      this.db.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, username: true },
        orderBy: { name: 'asc' },
      }),
      this.db.assetGroup.findMany({
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
      this.db.mol.findMany({
        select: { id: true, code: true, fullName: true, storageLocation: true, departmentId: true },
        orderBy: { code: 'asc' },
      }),
      includeDocuments
        ? this.db.document.findMany({
          where: { status: { not: 'ARCHIVED' } },
          select: { id: true, title: true, category: true, status: true, projectId: true },
          orderBy: { updatedAt: 'desc' },
          take: 200,
        })
        : Promise.resolve([]),
    ])
    return { projects, suppliers, approvers, groups, mols, documents }
  }

  async create(input: CreateProcurementInput, actorId: string, requestId?: string) {
    return this.db.$transaction(async (tx) => {
      await this.validateReferences(tx, input.projectId, input.documentId, input.items.map((item) => item.groupId))
      const request = await tx.procurementRequest.create({
        data: {
          number: input.number,
          title: input.title,
          description: input.description || null,
          budgetLimit: new Prisma.Decimal(input.budgetLimit),
          neededBy: input.neededBy || null,
          projectId: input.projectId || null,
          documentId: input.documentId || null,
          requestedById: actorId,
          items: {
            create: input.items.map((item) => ({
              ...item,
              groupId: item.groupId || null,
              quantity: new Prisma.Decimal(item.quantity),
              unitPrice: new Prisma.Decimal(item.unitPrice),
            })),
          },
        },
        include,
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'PROCUREMENT_CREATED',
          entityType: 'ProcurementRequest',
          entityId: request.id,
          requestId,
          details: { number: request.number, budgetLimit: request.budgetLimit.toString() },
        },
      })
      return serialize(request)
    })
  }

  async update(id: string, input: UpdateProcurementInput, actorId: string, requestId?: string) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.procurementRequest.findUnique({ where: { id } })
      if (!current) throw new ProcurementError('NOT_FOUND')
      if (current.status !== ProcurementStatus.DRAFT) throw new ProcurementError('INVALID_STATE')
      await this.validateReferences(tx, input.projectId, input.documentId, input.items.map((item) => item.groupId))
      await tx.procurementItem.deleteMany({ where: { requestId: id } })
      const updated = await tx.procurementRequest.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description || null,
          budgetLimit: new Prisma.Decimal(input.budgetLimit),
          neededBy: input.neededBy || null,
          projectId: input.projectId || null,
          documentId: input.documentId || null,
          items: {
            create: input.items.map((item) => ({
              ...item,
              groupId: item.groupId || null,
              quantity: new Prisma.Decimal(item.quantity),
              unitPrice: new Prisma.Decimal(item.unitPrice),
            })),
          },
        },
        include,
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'PROCUREMENT_UPDATED',
          entityType: 'ProcurementRequest',
          entityId: id,
          requestId,
          details: { budgetLimit: updated.budgetLimit.toString(), itemCount: updated.items.length },
        },
      })
      return serialize(updated)
    })
  }

  async submit(
    id: string,
    input: SubmitProcurementInput,
    actorId: string,
    requestId: string | undefined,
    createApproval: CreateApproval,
  ) {
    const request = await this.db.procurementRequest.findUnique({ where: { id }, include })
    if (!request) throw new ProcurementError('NOT_FOUND')
    if (request.status !== ProcurementStatus.DRAFT || request.approvalRequestId) {
      throw new ProcurementError('INVALID_STATE')
    }
    const approval = await createApproval({
      title: `Закупка ${request.number}: ${request.title}`,
      description: request.description || undefined,
      entityType: 'ProcurementRequest',
      entityId: request.id,
      projectId: request.projectId || undefined,
      documentId: request.documentId || undefined,
      dueAt: input.dueAt || undefined,
      steps: input.steps,
    })
    const updated = await this.db.procurementRequest.update({
      where: { id },
      data: {
        approvalRequestId: approval.id,
        status: ProcurementStatus.SUBMITTED,
      },
      include,
    })
    await this.audit(actorId, 'PROCUREMENT_SUBMITTED', id, requestId, { approvalRequestId: approval.id })
    return serialize(updated)
  }

  async createSupplier(input: CreateSupplierInput, actorId: string, requestId?: string) {
    const supplier = await this.db.supplier.create({
      data: {
        name: input.name,
        taxId: input.taxId || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
      },
    })
    await this.audit(actorId, 'SUPPLIER_CREATED', supplier.id, requestId, { name: supplier.name })
    return supplier
  }

  async createContract(
    id: string,
    input: CreateContractInput,
    actorId: string,
    requestId?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const request = await tx.procurementRequest.findUnique({
        where: { id },
        include: { approvalRequest: true, contract: true },
      })
      if (!request) throw new ProcurementError('NOT_FOUND')
      if (request.contract || request.approvalRequest?.status !== ApprovalRequestStatus.APPROVED) {
        throw new ProcurementError('INVALID_STATE')
      }
      if (new Prisma.Decimal(input.amount).gt(request.budgetLimit)) {
        throw new ProcurementError('BUDGET_EXCEEDED')
      }
      const [supplier, document] = await Promise.all([
        tx.supplier.findFirst({ where: { id: input.supplierId, isActive: true }, select: { id: true } }),
        input.documentId
          ? tx.document.findUnique({ where: { id: input.documentId }, select: { id: true } })
          : null,
      ])
      if (!supplier || (input.documentId && !document)) throw new ProcurementError('REFERENCE_NOT_FOUND')
      await tx.procurementContract.create({
        data: {
          requestId: id,
          supplierId: input.supplierId,
          number: input.number,
          amount: new Prisma.Decimal(input.amount),
          signedAt: input.signedAt,
          deliveryDueAt: input.deliveryDueAt,
          documentId: input.documentId || null,
        },
      })
      await tx.procurementRequest.update({ where: { id }, data: { status: ProcurementStatus.CONTRACTED } })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'PROCUREMENT_CONTRACTED',
          entityType: 'ProcurementRequest',
          entityId: id,
          requestId,
          details: { contractNumber: input.number, amount: String(input.amount), supplierId: input.supplierId },
        },
      })
      return serialize(await tx.procurementRequest.findUniqueOrThrow({ where: { id }, include }))
    })
  }

  async createDelivery(
    id: string,
    input: CreateDeliveryInput,
    actorId: string,
    requestId?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const request = await tx.procurementRequest.findUnique({
        where: { id },
        include: {
          contract: true,
          items: { include: { deliveryItems: true } },
        },
      })
      if (!request) throw new ProcurementError('NOT_FOUND')
      if (
        !request.contract ||
        (
          request.status !== ProcurementStatus.CONTRACTED &&
          request.status !== ProcurementStatus.PARTIALLY_DELIVERED
        )
      ) {
        throw new ProcurementError('INVALID_STATE')
      }
      const lines = new Map(request.items.map((item) => [item.id, item]))
      for (const delivered of input.items) {
        const item = lines.get(delivered.procurementItemId)
        if (!item) throw new ProcurementError('REFERENCE_NOT_FOUND')
        const already = item.deliveryItems.reduce(
          (sum, deliveryItem) => sum.add(deliveryItem.quantity),
          new Prisma.Decimal(0),
        )
        if (already.add(delivered.quantity).gt(item.quantity)) {
          throw new ProcurementError('DELIVERY_EXCEEDED')
        }
      }
      if (input.documentId) {
        const exists = await tx.document.count({ where: { id: input.documentId } })
        if (!exists) throw new ProcurementError('REFERENCE_NOT_FOUND')
      }
      await tx.procurementDelivery.create({
        data: {
          requestId: id,
          contractId: request.contract.id,
          number: input.number,
          receivedAt: input.receivedAt,
          note: input.note || null,
          documentId: input.documentId || null,
          items: {
            create: input.items.map((item) => ({
              procurementItemId: item.procurementItemId,
              quantity: new Prisma.Decimal(item.quantity),
            })),
          },
        },
      })
      const fullyDelivered = request.items.every((item) => {
        const prior = item.deliveryItems.reduce(
          (sum, deliveryItem) => sum.add(deliveryItem.quantity),
          new Prisma.Decimal(0),
        )
        const current = input.items
          .filter((candidate) => candidate.procurementItemId === item.id)
          .reduce((sum, candidate) => sum.add(candidate.quantity), new Prisma.Decimal(0))
        return prior.add(current).equals(item.quantity)
      })
      await tx.procurementRequest.update({
        where: { id },
        data: {
          status: fullyDelivered
            ? ProcurementStatus.DELIVERED
            : ProcurementStatus.PARTIALLY_DELIVERED,
        },
      })
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'PROCUREMENT_DELIVERY_REGISTERED',
          entityType: 'ProcurementRequest',
          entityId: id,
          requestId,
          details: { deliveryNumber: input.number, fullyDelivered },
        },
      })
      return serialize(await tx.procurementRequest.findUniqueOrThrow({ where: { id }, include }))
    })
  }

  async capitalize(
    deliveryItemId: string,
    input: CapitalizeDeliveryItemInput,
    actorId: string,
    requestId: string | undefined,
    createAsset: CreateAsset,
  ) {
    const deliveryItem = await this.db.procurementDeliveryItem.findUnique({
      where: { id: deliveryItemId },
      include: {
        delivery: {
          include: {
            request: { include: { contract: true } },
          },
        },
        procurementItem: true,
      },
    })
    if (!deliveryItem) throw new ProcurementError('NOT_FOUND')
    if (deliveryItem.assetId) throw new ProcurementError('ALREADY_CAPITALIZED')
    const groupId = input.groupId || deliveryItem.procurementItem.groupId
    if (!groupId) throw new ProcurementError('REFERENCE_NOT_FOUND')
    const asset = await createAsset({
      name: deliveryItem.procurementItem.name,
      inventoryNumber: input.inventoryNumber,
      unitPrice: Number(deliveryItem.procurementItem.unitPrice),
      unitOfMeasure: deliveryItem.procurementItem.unit,
      quantity: Number(deliveryItem.quantity),
      molId: input.molId,
      groupId,
      projectId: deliveryItem.delivery.request.projectId,
      contractCode: deliveryItem.delivery.request.contract?.number,
      internalFundingCode: deliveryItem.delivery.request.number,
      isExistingAsset: false,
      recordingDate: deliveryItem.delivery.receivedAt.toISOString(),
      documentType: 'Акт поставки',
      documentDetails: `Поставка ${deliveryItem.delivery.number}`,
      documentFiles: [],
      status: 'IN_STOCK',
      notes: input.notes,
      plannedDisposalDate: null,
      plannedDisposalReason: null,
      photos: [],
      accountingForm: input.accountingForm,
    })
    await this.db.$transaction(async (tx) => {
      const linked = await tx.procurementDeliveryItem.updateMany({
        where: { id: deliveryItemId, assetId: null },
        data: { assetId: asset.id },
      })
      if (linked.count !== 1) throw new ProcurementError('ALREADY_CAPITALIZED')
      const remaining = await tx.procurementDeliveryItem.count({
        where: { delivery: { requestId: deliveryItem.delivery.requestId }, assetId: null },
      })
      const request = await tx.procurementRequest.findUniqueOrThrow({
        where: { id: deliveryItem.delivery.requestId },
        select: { status: true },
      })
      if (remaining === 0 && request.status === ProcurementStatus.DELIVERED) {
        await tx.procurementRequest.update({
          where: { id: deliveryItem.delivery.requestId },
          data: { status: ProcurementStatus.CAPITALIZED },
        })
      }
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'PROCUREMENT_CAPITALIZED',
          entityType: 'ProcurementRequest',
          entityId: deliveryItem.delivery.requestId,
          requestId,
          details: { deliveryItemId, assetId: asset.id, inventoryNumber: asset.inventoryNumber },
        },
      })
    })
    return { assetId: asset.id, requestId: deliveryItem.delivery.requestId }
  }

  private async validateReferences(
    tx: Prisma.TransactionClient,
    projectId?: string | null,
    documentId?: string | null,
    groupIds: Array<string | null | undefined> = [],
  ) {
    const uniqueGroups = [...new Set(groupIds.filter((id): id is string => Boolean(id)))]
    const [project, document, groupCount] = await Promise.all([
      projectId ? tx.project.count({ where: { id: projectId } }) : 1,
      documentId ? tx.document.count({ where: { id: documentId } }) : 1,
      uniqueGroups.length ? tx.assetGroup.count({ where: { id: { in: uniqueGroups } } }) : 0,
    ])
    if (!project || !document || groupCount !== uniqueGroups.length) {
      throw new ProcurementError('REFERENCE_NOT_FOUND')
    }
  }

  private async audit(
    actorId: string,
    action: string,
    entityId: string,
    requestId?: string,
    details?: Prisma.InputJsonValue,
  ) {
    await this.db.auditLog.create({
      data: {
        userId: actorId,
        action,
        entityType: action === 'SUPPLIER_CREATED' ? 'Supplier' : 'ProcurementRequest',
        entityId,
        requestId,
        details,
      },
    })
  }
}

let procurementService: ProcurementService | undefined

export function getProcurementService() {
  procurementService ??= new ProcurementService()
  return procurementService
}
