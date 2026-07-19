import { z } from 'zod'

export const reportPresetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  metrics: z.array(z.string()).min(1),
  groupBy: z.string().trim().nullable().optional(),
  filters: z.record(z.any()).nullable().optional(),
})

export type ReportPresetInput = z.infer<typeof reportPresetSchema>
