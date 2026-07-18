import { z } from 'zod'
import { APP_ROLES } from '@/lib/auth/permissions'

export const appRoleSchema = z.enum(APP_ROLES)
export const scopeModeSchema = z.enum(['NONE', 'ALL', 'ASSIGNED', 'SELF'])

const assignmentSchema = z.object({
  role: appRoleSchema,
  departmentScopeMode: scopeModeSchema,
  projectScopeMode: scopeModeSchema,
  departmentIds: z.array(z.string().min(1)).default([]),
  projectIds: z.array(z.string().min(1)).default([]),
}).superRefine((assignment, context) => {
  if (assignment.departmentScopeMode === 'ASSIGNED' && assignment.departmentIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['departmentIds'],
      message: 'Выберите хотя бы одно подразделение',
    })
  }
  if (assignment.projectScopeMode === 'ASSIGNED' && assignment.projectIds.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectIds'],
      message: 'Выберите хотя бы один проект',
    })
  }
  if (assignment.departmentScopeMode !== 'ASSIGNED' && assignment.departmentIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['departmentIds'],
      message: 'Для этого режима список подразделений должен быть пуст',
    })
  }
  if (assignment.projectScopeMode !== 'ASSIGNED' && assignment.projectIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectIds'],
      message: 'Для этого режима список проектов должен быть пуст',
    })
  }
})

const assignmentsSchema = z.array(assignmentSchema).min(1, 'Назначьте хотя бы одну роль').max(APP_ROLES.length)
  .superRefine((assignments, context) => {
    const seen = new Set<string>()
    assignments.forEach((assignment, index) => {
      if (seen.has(assignment.role)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'role'],
          message: 'Роль уже назначена',
        })
      }
      seen.add(assignment.role)
    })
  })

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Логин должен содержать минимум 3 символа')
  .max(100)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Допустимы латинские буквы, цифры, точка, _ и -')
  .transform((value) => value.toLowerCase())

const passwordSchema = z
  .string()
  .min(7, 'Пароль должен содержать минимум 7 символов')
  .max(512)

export const createUserSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(2).max(200),
  employeeId: z.string().min(1).nullable().optional(),
  assignments: assignmentsSchema,
  temporaryPassword: passwordSchema,
}).superRefine((input, context) => {
  if (input.assignments.some((assignment) => assignment.role === 'EMPLOYEE') && !input.employeeId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['employeeId'],
      message: 'Для роли сотрудника привяжите кадровую карточку',
    })
  }
})

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    employeeId: z.string().min(1).nullable().optional(),
    assignments: assignmentsSchema.optional(),
    isActive: z.boolean().optional(),
    temporaryPassword: passwordSchema.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Необходимо передать хотя бы одно изменение',
  })
  .superRefine((input, context) => {
    if (
      input.assignments?.some((assignment) => assignment.role === 'EMPLOYEE') &&
      input.employeeId === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['employeeId'],
        message: 'Для роли сотрудника привяжите кадровую карточку',
      })
    }
  })

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(512),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'Новый пароль должен отличаться от текущего',
  })

export const usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export type RoleAssignmentInput = z.infer<typeof assignmentSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
