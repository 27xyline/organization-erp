import { z } from 'zod'

export const REPORT_METRICS = [
  'headcount',
  'occupiedRate',
  'plannedFot',
  'assetValue',
  'projectBudget',
  'actualFot',
] as const

export type ReportMetric = (typeof REPORT_METRICS)[number]

export const reportPresetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  metrics: z.array(z.enum(REPORT_METRICS)).min(1),
  groupBy: z.enum(['department', 'project']).nullable().optional(),
  filters: z.record(z.any()).nullable().optional(),
})

export type ReportPresetInput = z.infer<typeof reportPresetSchema>
