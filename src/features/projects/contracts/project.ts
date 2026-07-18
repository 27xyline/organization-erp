import { z } from 'zod'

export const createProjectSchema = z.object({
  code: z.string().min(1, 'Код проекта обязателен').max(50),
  name: z.string().min(1, 'Название проекта обязательно').max(300),
  description: z.string().max(2000).optional().nullable(),
  goals: z.string().max(2000).optional().nullable(),
  tasks: z.string().max(2000).optional().nullable(),
  results: z.string().max(2000).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']).optional().default('ACTIVE'),
  plannedBudget: z.coerce.number().min(0).optional().default(0),
  actualBudget: z.coerce.number().min(0).optional().default(0),
  templateId: z.enum(['RESEARCH', 'PROCUREMENT']).optional().nullable(),
}).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
  path: ['endDate'],
  message: 'Дата окончания должна быть не раньше даты начала',
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
