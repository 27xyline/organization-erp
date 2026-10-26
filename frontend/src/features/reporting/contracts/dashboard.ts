import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const dashboardQuerySchema = z.object({
  dateFrom: isoDate,
  dateTo: isoDate,
  departmentId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
}).superRefine((value, context) => {
  if (value.dateFrom > value.dateTo) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dateTo'],
      message: 'Дата окончания должна быть не раньше даты начала',
    })
  }
})

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>

export function defaultDashboardQuery(now = new Date()): DashboardQuery {
  const year = now.getUTCFullYear()
  return {
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
  }
}

export function parseDashboardQuery(
  raw: Record<string, string | string[] | undefined>,
  now = new Date(),
): DashboardQuery {
  const defaults = defaultDashboardQuery(now)
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value
  const parsed = dashboardQuerySchema.safeParse({
    dateFrom: first(raw.dateFrom) || defaults.dateFrom,
    dateTo: first(raw.dateTo) || defaults.dateTo,
    departmentId: first(raw.departmentId) || undefined,
    projectId: first(raw.projectId) || undefined,
  })
  return parsed.success ? parsed.data : defaults
}

