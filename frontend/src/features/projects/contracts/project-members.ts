import { z } from 'zod'

export const projectMemberCreateSchema = z.object({
  employeeId: z.string({ required_error: 'Сотрудник обязателен' }).min(1, 'Сотрудник обязателен'),
})

export const projectMemberUpdateSchema = z.object({
  isArchived: z.boolean(),
})

export type ProjectMemberCreateInput = z.infer<typeof projectMemberCreateSchema>
export type ProjectMemberUpdateInput = z.infer<typeof projectMemberUpdateSchema>
