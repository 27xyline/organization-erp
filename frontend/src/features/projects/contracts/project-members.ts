import { z } from 'zod'

export const projectMemberCreateSchema = z.object({
  employeeId: z.string({ error: (issue) => issue.input === undefined ? 'Сотрудник обязателен' : undefined }).min(1, 'Сотрудник обязателен'),
})

export const projectMemberUpdateSchema = z.object({
  isArchived: z.boolean(),
})

export type ProjectMemberCreateInput = z.infer<typeof projectMemberCreateSchema>
export type ProjectMemberUpdateInput = z.infer<typeof projectMemberUpdateSchema>
