import {
  ApprovalRequestStatus,
  ApprovalStepStatus,
  DocumentStatus,
  NotificationEventType,
  Prisma,
  type PrismaClient,
} from '@prisma/client'
import { getDb } from '@/lib/prisma'
import type {
  ApprovalDecisionInput,
  ApprovalQuery,
  CreateApprovalTemplateInput,
  CreateApprovalInput,
  UpdateApprovalTemplateInput,
} from '../contracts/approval'

interface ApprovalNotifier {
  publish(input: {
    recipientUserIds: readonly string[]
    eventType: NotificationEventType
    title: string
    body: string
    dedupeKey: string
    targetUrl?: string | null
    entityType?: string | null
    entityId?: string | null
    actorId?: string | null
    requestId?: string | null
  }): Promise<unknown>
}

export type ApprovalErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE'
  | 'INVALID_APPROVER'
  | 'REFERENCE_NOT_FOUND'
  | 'TEMPLATE_EXISTS'
  | 'TEMPLATE_NOT_FOUND'

export class ApprovalServiceError extends Error {
  constructor(public readonly code: ApprovalErrorCode) {
    super(code)
    this.name = 'ApprovalServiceError'
  }
}

const include = {
  requestedBy: { select: { id: true, name: true } },
  document: { select: { id: true, title: true, status: true } },
  project: { select: { id: true, code: true, name: true } },
  steps: {
    include: { approver: { select: { id: true, name: true } } },
    orderBy: { sequence: 'asc' as const },
  },
} satisfies Prisma.ApprovalRequestInclude

function visibleWhere(userId: string, canViewAll: boolean, assignedToMe?: boolean) {
  if (assignedToMe) return { steps: { some: { approverId: userId } } }
  if (canViewAll) return {}
  return {
    OR: [
      { requestedById: userId },
      { steps: { some: { approverId: userId } } },
    ],
  }
}

export class ApprovalService {
  constructor(
    private readonly db: PrismaClient = getDb(),
    private readonly notifier?: ApprovalNotifier,
  ) {}

  async list(userId: string, canViewAll: boolean, query: ApprovalQuery) {
    const where: Prisma.ApprovalRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      AND: [
        visibleWhere(userId, canViewAll, query.assignedToMe),
        query.search
          ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
          : {},
      ],
    }
    const [requests, total] = await this.db.$transaction([
      this.db.approvalRequest.findMany({
        where,
        include,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.approvalRequest.count({ where }),
    ])
    return { requests, total }
  }

  async getVisibleById(id: string, userId: string, canViewAll: boolean) {
    return this.db.approvalRequest.findFirst({
      where: { id, ...visibleWhere(userId, canViewAll) },
      include,
    })
  }

  async listPendingForUser(userId: string, limit = 5) {
    const where: Prisma.ApprovalRequestWhereInput = {
      status: ApprovalRequestStatus.PENDING,
      steps: {
        some: {
          approverId: userId,
          status: ApprovalStepStatus.PENDING,
        },
      },
    }
    const [records, total] = await this.db.$transaction([
      this.db.approvalRequest.findMany({
        where,
        select: {
          id: true,
          title: true,
          currentStep: true,
          dueAt: true,
          requestedBy: { select: { name: true } },
          steps: {
            where: {
              approverId: userId,
              status: ApprovalStepStatus.PENDING,
            },
            select: { sequence: true, name: true, approverId: true },
          },
        },
        orderBy: [
          { dueAt: { sort: 'asc', nulls: 'last' } },
          { updatedAt: 'desc' },
        ],
        take: limit,
      }),
      this.db.approvalRequest.count({ where }),
    ])

    const requests = records.flatMap((record) => {
      const step = record.steps.find((candidate) =>
        candidate.sequence === record.currentStep
        && candidate.approverId === userId
      )
      return step
        ? [{
            id: record.id,
            title: record.title,
            dueAt: record.dueAt,
            requestedBy: record.requestedBy,
            step: { sequence: step.sequence, name: step.name },
          }]
        : []
    })
    return { requests, total }
  }

  approverOptions() {
    return this.db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, username: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
  }

  listTemplates(includeInactive = false) {
    return this.db.approvalTemplate.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: { id: true, name: true, steps: true, isActive: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })
  }

  async createTemplate(input: CreateApprovalTemplateInput, creatorId: string, requestId?: string) {
    try {
      return await this.db.$transaction(async (tx) => {
        await this.assertActiveApprovers(
          input.steps.map((step) => step.approverId),
          tx,
        )
        const template = await tx.approvalTemplate.create({
          data: {
            name: input.name,
            steps: input.steps,
            isActive: true,
            createdById: creatorId,
          },
          select: { id: true, name: true, steps: true, isActive: true },
        })
        await tx.auditLog.create({
          data: {
            userId: creatorId,
            action: 'APPROVAL_TEMPLATE_CREATE',
            entityType: 'ApprovalTemplate',
            entityId: template.id,
            details: { name: template.name, stepCount: input.steps.length },
            ...(requestId ? { requestId } : {}),
          },
        })
        return template
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApprovalServiceError('TEMPLATE_EXISTS')
      }
      throw error
    }
  }

  async updateTemplate(
    id: string,
    input: UpdateApprovalTemplateInput,
    actorId: string,
    requestId?: string,
  ) {
    try {
      return await this.db.$transaction(async (tx) => {
        if (input.steps) {
          await this.assertActiveApprovers(
            input.steps.map((step) => step.approverId),
            tx,
          )
        }
        const template = await tx.approvalTemplate.update({
          where: { id },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.steps === undefined ? {} : { steps: input.steps }),
            ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          },
          select: { id: true, name: true, steps: true, isActive: true },
        })
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: 'APPROVAL_TEMPLATE_UPDATE',
            entityType: 'ApprovalTemplate',
            entityId: template.id,
            details: {
              name: template.name,
              isActive: template.isActive,
              ...(input.steps ? { stepCount: input.steps.length } : {}),
            },
            ...(requestId ? { requestId } : {}),
          },
        })
        return template
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ApprovalServiceError('TEMPLATE_EXISTS')
        if (error.code === 'P2025') throw new ApprovalServiceError('TEMPLATE_NOT_FOUND')
      }
      throw error
    }
  }

  private async assertActiveApprovers(
    approverIds: string[],
    client: Pick<PrismaClient, 'user'> = this.db,
  ) {
    const count = await client.user.count({
      where: { id: { in: approverIds }, isActive: true },
    })
    if (count !== approverIds.length) throw new ApprovalServiceError('INVALID_APPROVER')
  }

  async create(
    input: CreateApprovalInput,
    actorId: string,
    requestId?: string,
  ) {
    const approverIds = input.steps.map((step) => step.approverId)
    const request = await this.db.$transaction(async (tx) => {
      const [approverCount, document, project] = await Promise.all([
        tx.user.count({ where: { id: { in: approverIds }, isActive: true } }),
        input.documentId
          ? tx.document.findUnique({
              where: { id: input.documentId },
              select: { id: true, status: true },
            })
          : null,
        input.projectId
          ? tx.project.findUnique({ where: { id: input.projectId }, select: { id: true } })
          : null,
      ])
      if (approverCount !== approverIds.length) {
        throw new ApprovalServiceError('INVALID_APPROVER')
      }
      if ((input.documentId && !document) || (input.projectId && !project)) {
        throw new ApprovalServiceError('REFERENCE_NOT_FOUND')
      }
      if (document?.status === DocumentStatus.ARCHIVED) {
        throw new ApprovalServiceError('INVALID_STATE')
      }

      const created = await tx.approvalRequest.create({
        data: {
          title: input.title,
          description: input.description || null,
          entityType: input.entityType || null,
          entityId: input.entityId || null,
          documentId: input.documentId || null,
          projectId: input.projectId || null,
          requestedById: actorId,
          status: ApprovalRequestStatus.PENDING,
          currentStep: 1,
          submittedAt: new Date(),
          dueAt: input.dueAt || null,
          steps: {
            create: input.steps.map((step, index) => ({
              sequence: index + 1,
              name: step.name,
              approverId: step.approverId,
              status: index === 0
                ? ApprovalStepStatus.PENDING
                : ApprovalStepStatus.WAITING,
            })),
          },
        },
        include,
      })
      if (input.documentId) {
        await tx.document.update({
          where: { id: input.documentId },
          data: { status: DocumentStatus.IN_REVIEW, lockVersion: { increment: 1 } },
        })
      }
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'APPROVAL_SUBMIT',
          entityType: 'ApprovalRequest',
          entityId: created.id,
          details: { title: created.title, stepCount: created.steps.length },
          requestId,
        },
      })
      return created
    })

    await this.notifier?.publish({
      recipientUserIds: [request.steps[0]!.approverId],
      eventType: NotificationEventType.APPROVAL_REQUESTED,
      title: 'Новое согласование',
      body: request.title,
      dedupeKey: `approval:${request.id}:step:1`,
      targetUrl: '/approvals',
      entityType: 'ApprovalRequest',
      entityId: request.id,
      actorId,
      requestId,
    }).catch(() => undefined)
    return request
  }

  async decide(
    approvalId: string,
    actorId: string,
    input: ApprovalDecisionInput,
    requestId?: string,
  ) {
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "approval_requests" WHERE "id" = ${approvalId} FOR UPDATE
      `
      const request = await tx.approvalRequest.findUnique({
        where: { id: approvalId },
        include,
      })
      if (!request) throw new ApprovalServiceError('NOT_FOUND')
      if (request.status !== ApprovalRequestStatus.PENDING) {
        throw new ApprovalServiceError('INVALID_STATE')
      }
      const current = request.steps.find(
        (step) =>
          step.sequence === request.currentStep
          && step.status === ApprovalStepStatus.PENDING,
      )
      if (!current) throw new ApprovalServiceError('INVALID_STATE')
      if (current.approverId !== actorId) {
        throw new ApprovalServiceError('FORBIDDEN')
      }

      const rejected = input.decision === 'REJECT'
      await tx.approvalStep.update({
        where: { id: current.id },
        data: {
          status: rejected ? ApprovalStepStatus.REJECTED : ApprovalStepStatus.APPROVED,
          comment: input.comment || null,
          decidedAt: new Date(),
        },
      })
      let nextApproverId: string | null = null
      let status: ApprovalRequestStatus = request.status
      if (rejected) {
        status = ApprovalRequestStatus.REJECTED
        await tx.approvalStep.updateMany({
          where: { requestId: request.id, status: ApprovalStepStatus.WAITING },
          data: { status: ApprovalStepStatus.SKIPPED },
        })
        await tx.approvalRequest.update({
          where: { id: request.id },
          data: {
            status,
            completedAt: new Date(),
            lockVersion: { increment: 1 },
          },
        })
        if (request.documentId) {
          await tx.document.update({
            where: { id: request.documentId },
            data: { status: DocumentStatus.DRAFT, lockVersion: { increment: 1 } },
          })
        }
      } else {
        const next = request.steps.find(
          (step) => step.sequence === current.sequence + 1,
        )
        if (next) {
          nextApproverId = next.approverId
          await tx.approvalStep.update({
            where: { id: next.id },
            data: { status: ApprovalStepStatus.PENDING },
          })
          await tx.approvalRequest.update({
            where: { id: request.id },
            data: {
              currentStep: next.sequence,
              lockVersion: { increment: 1 },
            },
          })
        } else {
          status = ApprovalRequestStatus.APPROVED
          await tx.approvalRequest.update({
            where: { id: request.id },
            data: {
              status,
              completedAt: new Date(),
              lockVersion: { increment: 1 },
            },
          })
          if (request.documentId) {
            await tx.document.update({
              where: { id: request.documentId },
              data: { status: DocumentStatus.APPROVED, lockVersion: { increment: 1 } },
            })
          }
        }
      }
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: rejected ? 'APPROVAL_REJECT' : 'APPROVAL_APPROVE',
          entityType: 'ApprovalRequest',
          entityId: request.id,
          details: { sequence: current.sequence, comment: input.comment || null },
          requestId,
        },
      })
      return {
        requestId: request.id,
        title: request.title,
        requestedById: request.requestedById,
        nextApproverId,
        nextSequence: current.sequence + 1,
        status,
      }
    })

    const recipientUserIds = result.nextApproverId
      ? [result.nextApproverId]
      : [result.requestedById]
    await this.notifier?.publish({
      recipientUserIds,
      eventType: result.nextApproverId
        ? NotificationEventType.APPROVAL_REQUESTED
        : NotificationEventType.APPROVAL_DECIDED,
      title: result.nextApproverId ? 'Требуется согласование' : 'Согласование завершено',
      body: result.title,
      dedupeKey: result.nextApproverId
        ? `approval:${result.requestId}:step:${result.nextSequence}`
        : `approval:${result.requestId}:result:${result.status}`,
      targetUrl: '/approvals',
      entityType: 'ApprovalRequest',
      entityId: result.requestId,
      actorId,
      requestId,
    }).catch(() => undefined)
    return result
  }

  async cancel(approvalId: string, actorId: string, requestId?: string) {
    const request = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "approval_requests" WHERE "id" = ${approvalId} FOR UPDATE
      `
      const current = await tx.approvalRequest.findUnique({
        where: { id: approvalId },
        select: {
          id: true,
          title: true,
          requestedById: true,
          documentId: true,
          status: true,
        },
      })
      if (!current) throw new ApprovalServiceError('NOT_FOUND')
      if (current.requestedById !== actorId) throw new ApprovalServiceError('FORBIDDEN')
      if (
        current.status !== ApprovalRequestStatus.DRAFT
        && current.status !== ApprovalRequestStatus.PENDING
      ) {
        throw new ApprovalServiceError('INVALID_STATE')
      }
      await tx.approvalStep.updateMany({
        where: {
          requestId: current.id,
          status: { in: [ApprovalStepStatus.WAITING, ApprovalStepStatus.PENDING] },
        },
        data: { status: ApprovalStepStatus.SKIPPED },
      })
      await tx.approvalRequest.update({
        where: { id: current.id },
        data: {
          status: ApprovalRequestStatus.CANCELLED,
          completedAt: new Date(),
          lockVersion: { increment: 1 },
        },
      })
      if (current.documentId) {
        await tx.document.update({
          where: { id: current.documentId },
          data: { status: DocumentStatus.DRAFT, lockVersion: { increment: 1 } },
        })
      }
      await tx.auditLog.create({
        data: {
          userId: actorId,
          action: 'APPROVAL_CANCEL',
          entityType: 'ApprovalRequest',
          entityId: current.id,
          requestId,
        },
      })
      return current
    })
    return request
  }
}

let approvalService: ApprovalService | undefined

export function getApprovalService(notifier?: ApprovalNotifier) {
  if (notifier) return new ApprovalService(getDb(), notifier)
  approvalService ??= new ApprovalService()
  return approvalService
}
