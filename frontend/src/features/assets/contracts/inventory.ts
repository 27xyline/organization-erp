import { z } from 'zod'

export const createAssetInventorySchema = z.object({
  name: z.string().trim().min(3).max(120),
  molId: z.string().trim().min(1).max(128),
})

export const recordAssetInventoryCountSchema = z.object({
  inventoryNumber: z.string().trim().min(1).max(100),
  foundQuantity: z.coerce.number().finite().min(0).max(99_999_999.99)
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, {
      message: 'Количество может содержать не более двух знаков после запятой',
    }),
  note: z.string().trim().max(1000).nullable().optional(),
})

export const assetInventoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const assetInventoryEntriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(120).optional(),
})

export type CreateAssetInventoryInput = z.infer<typeof createAssetInventorySchema>
export type RecordAssetInventoryCountInput = z.infer<typeof recordAssetInventoryCountSchema>
export type AssetInventoryListQuery = z.infer<typeof assetInventoryListQuerySchema>
export type AssetInventoryEntriesQuery = z.infer<typeof assetInventoryEntriesQuerySchema>
