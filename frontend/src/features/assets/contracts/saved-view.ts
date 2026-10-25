import { z } from 'zod'

export const assetSavedViewFiltersSchema = z.object({
  search: z.string().trim().max(200).optional().transform((value) => value || undefined),
  molId: z.string().trim().min(1).max(128).optional(),
  groupId: z.string().trim().min(1).max(128).optional(),
  status: z.enum([
    'IN_STOCK',
    'IN_USE',
    'UNDER_REPAIR',
    'PLANNED_FOR_DISPOSAL',
    'PARTIALLY_DISPOSED',
    'FULLY_DISPOSED',
  ]).optional(),
  accountingForm: z.enum(['145', '367']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict().refine(
  (value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
  { path: ['dateTo'], message: 'Дата окончания должна быть не раньше даты начала' },
)

export const createAssetSavedViewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  filters: assetSavedViewFiltersSchema,
})

export type AssetSavedViewFilters = z.infer<typeof assetSavedViewFiltersSchema>
export type CreateAssetSavedViewInput = z.infer<typeof createAssetSavedViewSchema>

export interface AssetSavedViewSummary {
  id: string
  name: string
  filters: AssetSavedViewFilters
}
