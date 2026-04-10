import { z } from 'zod'

const financePlanTypeSchema = z.enum(['oklad', 'nadbavka'])

export const financePlanSaveSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  type: financePlanTypeSchema,
  employeeId: z.string().min(1, 'Employee is required'),
  projectId: z.string().optional(),
  amount: z.string().optional(),
  allocations: z.array(
    z.object({
      projectId: z.string().optional(),
      amount: z.string().optional(),
    })
  ).optional(),
})

export const financePlanDeleteSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  type: financePlanTypeSchema,
  employeeId: z.string().min(1, 'Employee is required'),
})

export type FinancePlanSaveInput = z.infer<typeof financePlanSaveSchema>
export type FinancePlanDeleteInput = z.infer<typeof financePlanDeleteSchema>
