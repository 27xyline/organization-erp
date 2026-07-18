import { PayrollAdjustmentType, PayrollPeriodStatus } from '@prisma/client'
import { z } from 'zod'

export const payrollQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

export const createPayrollAdjustmentSchema = z.object({
  employeeId: z.string().cuid(),
  projectId: z.string().cuid().nullable().optional(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  type: z.nativeEnum(PayrollAdjustmentType),
  amount: z.coerce.number().positive(),
  description: z.string().trim().min(2).max(500),
})

export const payrollPeriodSchema = payrollQuerySchema.extend({
  status: z.nativeEnum(PayrollPeriodStatus),
})

export type PayrollQuery = z.infer<typeof payrollQuerySchema>
export type CreatePayrollAdjustmentInput = z.infer<typeof createPayrollAdjustmentSchema>

export const PAYROLL_ADJUSTMENT_LABELS: Record<PayrollAdjustmentType, string> = {
  BONUS: 'Премия',
  ONE_TIME: 'Разовая выплата',
  DEDUCTION: 'Удержание',
}
