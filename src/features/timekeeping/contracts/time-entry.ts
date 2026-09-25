import { TimeEntryType } from '@prisma/client'
import { z } from 'zod'

export const timeEntryQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  employeeId: z.string().cuid().optional(),
  projectId: z.string().cuid().optional(),
})

export const createTimeEntrySchema = z.object({
  employeeId: z.string().cuid(),
  projectId: z.string().cuid().nullable().optional(),
  taskId: z.string().cuid().nullable().optional(),
  workDate: z.coerce.date(),
  type: z.nativeEnum(TimeEntryType),
  hours: z.coerce.number().positive().max(24),
  note: z.string().trim().max(500).nullable().optional(),
  correctionReason: z.string().trim().min(3).max(500).optional(),
})

export const updateTimeEntrySchema = createTimeEntrySchema.partial()

export type TimeEntryQuery = z.infer<typeof timeEntryQuerySchema>
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>

const payrollMonth = {
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
}

export const submitTimesheetSchema = z.object({
  employeeId: z.string().cuid(),
  ...payrollMonth,
  zeroHoursConfirmed: z.boolean().default(false),
})

export const timesheetDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'RETURN']),
  reason: z.string().trim().min(3).max(500).optional(),
}).superRefine((value, context) => {
  if (value.decision === 'RETURN' && !value.reason) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Укажите причину возврата' })
  }
})

export type SubmitTimesheetInput = z.infer<typeof submitTimesheetSchema>
export type TimesheetDecisionInput = z.infer<typeof timesheetDecisionSchema>

export const timeEntryDeleteSchema = z.object({
  correctionReason: z.string().trim().min(3).max(500).optional(),
}).default({})

export const TIME_ENTRY_TYPE_LABELS: Record<TimeEntryType, string> = {
  REGULAR: 'Работа',
  VACATION: 'Отпуск',
  SICK_LEAVE: 'Больничный',
  BUSINESS_TRIP: 'Командировка',
  OVERTIME: 'Переработка',
}
