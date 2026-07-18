import { z } from 'zod'

const nullableId = z.preprocess(
  (value) => value === '' ? null : value,
  z.string().trim().min(1).max(100).nullable().optional(),
)

const departmentFields = {
  code: z.string()
    .trim()
    .min(1, 'Код подразделения обязателен')
    .max(50)
    .regex(/^[\p{L}\p{N}._-]+$/u, 'Код может содержать буквы, цифры, точку, дефис и подчёркивание'),
  name: z.string().trim().min(1, 'Название подразделения обязательно').max(200),
  parentId: nullableId,
  headEmployeeId: nullableId,
  isActive: z.boolean().default(true),
}

export const createDepartmentSchema = z.object(departmentFields)

export const updateDepartmentSchema = z.object({
  code: departmentFields.code.optional(),
  name: departmentFields.name.optional(),
  parentId: departmentFields.parentId,
  headEmployeeId: departmentFields.headEmployeeId,
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'Укажите хотя бы одно изменяемое поле',
})

export const departmentsQuerySchema = z.object({
  activeOnly: z.enum(['true', 'false']).transform((value) => value === 'true').default('false'),
})

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>
