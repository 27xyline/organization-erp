import { z } from 'zod'

export function validateRequest<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): {
  success: true
  data: z.output<TSchema>
} | {
  success: false
  error: string
} {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  const firstError = result.error.errors[0]
  return {
    success: false,
    error: firstError?.message || 'Ошибка валидации данных',
  }
}
