import { z } from 'zod'

const optionalDate = z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
  if (!value) return null

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
})

const employeeIdsSchema = z.array(z.string().min(1)).optional().default([]).transform((value) => {
  return Array.from(new Set(value))
})

const predecessorIdsSchema = z.array(z.string().min(1)).max(50).optional().default([])
  .transform((value) => Array.from(new Set(value)))

const checklistSchema = z.array(z.object({
  title: z.string().trim().min(1).max(200),
  completed: z.boolean().optional().default(false),
})).max(100)

export const createTaskSchema = z.object({
  name: z.string().min(1, 'Название задачи обязательно').max(300),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().default('LOW'),
  isMilestone: z.boolean().optional().default(false),
  level: z.coerce.number().int().min(1).max(3).optional().default(1),
  parentId: z.string().min(1).optional().nullable(),
  startDate: optionalDate,
  endDate: optionalDate,
  duration: z.coerce.number().int().min(0).optional().nullable(),
  progress: z.coerce.number().int().min(0).max(100).optional().default(0),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']).optional().default('NOT_STARTED'),
  employeeIds: employeeIdsSchema,
  predecessorIds: predecessorIdsSchema,
  checklist: checklistSchema.optional().default([]),
})

export const updateTaskSchema = z.object({
  name: z.string().min(1, 'Название задачи обязательно').max(300).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  isMilestone: z.boolean().optional(),
  startDate: optionalDate.optional(),
  endDate: optionalDate.optional(),
  duration: z.coerce.number().int().min(0).optional().nullable(),
  progress: z.coerce.number().int().min(0).max(100).optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED']).optional(),
  employeeIds: employeeIdsSchema.optional(),
  predecessorIds: predecessorIdsSchema.optional(),
  checklist: checklistSchema.optional(),
})

export const createTaskCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>
