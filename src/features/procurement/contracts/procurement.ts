import { ProcurementStatus } from '@prisma/client'
import { z } from 'zod'

const optionalId = z.string().trim().min(1).max(100).nullable().optional()
const date = z.coerce.date()

export const procurementItemSchema = z.object({
  name: z.string().trim().min(2).max(300),
  quantity: z.coerce.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(30),
  unitPrice: z.coerce.number().positive().max(1_000_000_000),
  groupId: optionalId,
})

const procurementFieldsSchema = z.object({
  number: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(2000).nullable().optional(),
  budgetLimit: z.coerce.number().positive().max(10_000_000_000),
  neededBy: date.nullable().optional(),
  projectId: optionalId,
  documentId: optionalId,
  items: z.array(procurementItemSchema).min(1).max(50),
})

const withinBudget = (
  value: { budgetLimit: number; items: Array<{ quantity: number; unitPrice: number }> },
  ctx: z.RefinementCtx,
) => {
  const total = value.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  if (total > value.budgetLimit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['budgetLimit'],
      message: 'Стоимость позиций превышает бюджетный лимит',
    })
  }
}

export const createProcurementSchema = procurementFieldsSchema.superRefine(withinBudget)
export const updateProcurementSchema = procurementFieldsSchema.omit({ number: true }).superRefine(withinBudget)

export const submitProcurementSchema = z.object({
  dueAt: date.nullable().optional(),
  steps: z.array(z.object({
    name: z.string().trim().min(2).max(120),
    approverId: z.string().trim().min(1).max(100),
  })).min(1).max(10),
})

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(300),
  taxId: z.string().trim().regex(/^\d{10}(\d{2})?$/, 'ИНН должен содержать 10 или 12 цифр').nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
})

export const contractSchema = z.object({
  supplierId: z.string().trim().min(1).max(100),
  number: z.string().trim().min(2).max(100),
  amount: z.coerce.number().positive().max(10_000_000_000),
  signedAt: date,
  deliveryDueAt: date,
  documentId: optionalId,
}).refine((value) => value.deliveryDueAt >= value.signedAt, {
  path: ['deliveryDueAt'],
  message: 'Срок поставки не может быть раньше даты договора',
})

export const deliverySchema = z.object({
  number: z.string().trim().min(1).max(100),
  receivedAt: date,
  note: z.string().trim().max(1000).nullable().optional(),
  documentId: optionalId,
  items: z.array(z.object({
    procurementItemId: z.string().trim().min(1).max(100),
    quantity: z.coerce.number().positive().max(1_000_000),
  })).min(1).max(50),
})

export const capitalizeDeliveryItemSchema = z.object({
  inventoryNumber: z.string().trim().min(1).max(100),
  molId: z.string().trim().min(1).max(100),
  groupId: optionalId,
  accountingForm: z.enum(['145', '367']).default('145'),
  notes: z.string().trim().max(2000).nullable().optional(),
})

export const procurementQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(200).optional(),
  status: z.nativeEnum(ProcurementStatus).optional(),
})

export type CreateProcurementInput = z.infer<typeof createProcurementSchema>
export type UpdateProcurementInput = z.infer<typeof updateProcurementSchema>
export type SubmitProcurementInput = z.infer<typeof submitProcurementSchema>
export type CreateSupplierInput = z.infer<typeof supplierSchema>
export type CreateContractInput = z.infer<typeof contractSchema>
export type CreateDeliveryInput = z.infer<typeof deliverySchema>
export type CapitalizeDeliveryItemInput = z.infer<typeof capitalizeDeliveryItemSchema>
export type ProcurementQuery = z.infer<typeof procurementQuerySchema>
