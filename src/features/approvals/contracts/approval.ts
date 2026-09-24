import { ApprovalRequestStatus } from '@prisma/client'
import { z } from 'zod'

const optionalId = z.string().trim().min(1).max(128).nullable().optional()

export const createApprovalSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  documentId: optionalId,
  projectId: optionalId,
  entityType: z.string().trim().max(80).nullable().optional(),
  entityId: optionalId,
  dueAt: z.coerce.date().nullable().optional(),
  steps: z.array(z.object({
    approverId: z.string().trim().min(1).max(128),
    name: z.string().trim().min(2).max(120),
  })).min(1).max(20),
}).superRefine((value, context) => {
  const approvers = new Set(value.steps.map((step) => step.approverId))
  if (approvers.size !== value.steps.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['steps'],
      message: 'Согласующий не должен повторяться',
    })
  }
  if (value.dueAt && value.dueAt <= new Date()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dueAt'],
      message: 'Срок должен быть в будущем',
    })
  }
})

export const approvalDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().trim().max(2000).nullable().optional(),
})

export const approvalQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.nativeEnum(ApprovalRequestStatus).optional(),
  search: z.string().trim().max(200).optional(),
  assignedToMe: z.coerce.boolean().optional(),
})

export type CreateApprovalInput = z.infer<typeof createApprovalSchema>
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>
export type ApprovalQuery = z.infer<typeof approvalQuerySchema>

export interface PendingApprovalItem {
  id: string
  title: string
  dueAt: Date | null
  requestedBy: { name: string }
  step: { sequence: number; name: string }
}

export interface PendingApprovalsResult {
  requests: PendingApprovalItem[]
  total: number
}
