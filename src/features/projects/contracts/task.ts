import { z } from 'zod'

const optionalDate = z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
  if (!value) return null

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
})

const employeeIdsSchema = z.array(z.string().min(1)).optional().default([]).transform((value) => {
  return Array.from(new Set(value))
})

export const createTaskSchema = z.object({
  name: z.string().min(1, 'Название задачи обязательно').max(300),
  level: z.coerce.number().int().min(1).max(3).optional().default(1),
  parentId: z.string().min(1).optional().nullable(),
  startDate: optionalDate,
  endDate: optionalDate,
  duration: z.coerce.number().int().min(0).optional().nullable(),
  progress: z.coerce.number().int().min(0).max(100).optional().default(0),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']).optional().default('NOT_STARTED'),
  employeeIds: employeeIdsSchema,
})

export const updateTaskSchema = z.object({
  name: z.string().min(1, 'Название задачи обязательно').max(300).optional(),
  startDate: optionalDate.optional(),
  endDate: optionalDate.optional(),
  duration: z.coerce.number().int().min(0).optional().nullable(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']).optional(),
  employeeIds: employeeIdsSchema.optional(),
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
