import { z } from 'zod'

export const userRoleSchema = z.enum(['ADMIN', 'EDITOR', 'VIEWER'])

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Логин должен содержать минимум 3 символа')
  .max(100)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Допустимы латинские буквы, цифры, точка, _ и -')
  .transform((value) => value.toLowerCase())

const passwordSchema = z
  .string()
  .min(12, 'Пароль должен содержать минимум 12 символов')
  .max(512)

export const createUserSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(2).max(200),
  role: userRoleSchema,
  temporaryPassword: passwordSchema,
})

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    role: userRoleSchema.optional(),
    isActive: z.boolean().optional(),
    temporaryPassword: passwordSchema.optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Необходимо передать хотя бы одно изменение',
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

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
