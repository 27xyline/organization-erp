import { z } from 'zod'

export const projectPayrollSaveSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  employeeId: z.string().min(1, 'Сотрудник обязателен'),
  okladEnabled: z.boolean(),
  nadbavkaAmount: z.string().optional(),
})

export const projectPayrollDeleteSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  employeeId: z.string().min(1, 'Сотрудник обязателен'),
})

export type ProjectPayrollSaveInput = z.infer<typeof projectPayrollSaveSchema>
export type ProjectPayrollDeleteInput = z.infer<typeof projectPayrollDeleteSchema>
