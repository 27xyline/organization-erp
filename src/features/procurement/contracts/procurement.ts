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

export function isValidRussianINN(inn: string): boolean {
  if (!/^\d{10}$|^\d{12}$/.test(inn)) {
    return false
  }
  const digits = inn.split('').map(Number)
  if (digits.length === 10) {
    const coefficients = [2, 4, 10, 3, 5, 9, 4, 6, 8]
    const sum = coefficients.reduce((acc, coef, idx) => acc + coef * digits[idx], 0)
    const checkDigit = (sum % 11) % 10
    return checkDigit === digits[9]
  } else if (digits.length === 12) {
    const coefficients11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
    const sum11 = coefficients11.reduce((acc, coef, idx) => acc + coef * digits[idx], 0)
    const checkDigit11 = (sum11 % 11) % 10

    const coefficients12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
    const sum12 = coefficients12.reduce((acc, coef, idx) => acc + coef * digits[idx], 0)
    const checkDigit12 = (sum12 % 11) % 10
    return checkDigit11 === digits[10] && checkDigit12 === digits[11]
  }
  return false
}

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(300),
  taxId: z.string().trim().regex(/^\d{10}(\d{2})?$/, 'ИНН должен содержать 10 или 12 цифр')
    .nullable()
    .optional()
    .refine((val) => !val || isValidRussianINN(val), 'Некорректная контрольная сумма ИНН'),
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
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
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
