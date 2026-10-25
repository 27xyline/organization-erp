import { z } from 'zod'

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional()

export const employeeProfileSchema = z.object({
  birthDate: z.string().date().nullable().optional(),
  education: optionalText(1000),
  qualification: optionalText(1000),
  managerId: z.string().trim().min(1).max(128).nullable().optional(),
  skills: z.array(z.object({
    name: z.string().trim().min(2).max(100),
    level: z.coerce.number().int().min(1).max(5).nullable().optional(),
  })).max(50),
  certificates: z.array(z.object({
    name: z.string().trim().min(2).max(160),
    issuer: optionalText(160),
    number: optionalText(100),
    issuedAt: z.string().date().nullable().optional(),
    expiresAt: z.string().date().nullable().optional(),
  })).max(50),
}).superRefine((value, context) => {
  const names = new Set<string>()
  value.skills.forEach((skill, index) => {
    const key = skill.name.toLocaleLowerCase('ru-RU')
    if (names.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Навык указан повторно',
        path: ['skills', index, 'name'],
      })
    }
    names.add(key)
  })
  value.certificates.forEach((certificate, index) => {
    if (
      certificate.issuedAt
      && certificate.expiresAt
      && certificate.expiresAt < certificate.issuedAt
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Срок действия не может быть раньше даты выдачи',
        path: ['certificates', index, 'expiresAt'],
      })
    }
  })
})

export type EmployeeProfileInput = z.infer<typeof employeeProfileSchema>
