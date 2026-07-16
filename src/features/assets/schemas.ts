import { z } from 'zod'
import { createAssetSchema } from '@/lib/validations'

const operationDocumentSchema = z.object({
  date: z.coerce.date(),
  documentType: z.string().trim().min(1).max(200),
  documentDetails: z.string().trim().min(1).max(500),
  reason: z.string().trim().max(1000).optional().nullable(),
  documentFiles: z.array(z.string()).max(50).optional().default([]),
})

export const transferAssetSchema = operationDocumentSchema.extend({
  fromMolId: z.string().min(1),
  toMolId: z.string().min(1),
  quantity: z.coerce.number().positive(),
}).refine((value) => value.fromMolId !== value.toMolId, {
  path: ['toMolId'],
  message: 'Получатель должен отличаться от отправителя',
})

export const disposeAssetSchema = operationDocumentSchema.extend({
  fromMolId: z.string().min(1),
  quantity: z.coerce.number().positive(),
})

export const archiveAssetSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
})

export const updateAssetSchema = createAssetSchema.extend({
  editReason: z.string().trim().min(3, 'Основание редактирования обязательно').max(1000),
  isArchived: z.boolean().optional(),
})

export const assetsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  molId: z.string().optional(),
  groupId: z.string().optional(),
  status: z.enum([
    'IN_STOCK', 'IN_USE', 'UNDER_REPAIR',
    'PLANNED_FOR_DISPOSAL', 'PARTIALLY_DISPOSED', 'FULLY_DISPOSED',
  ]).optional(),
  accountingForm: z.enum(['145', '367']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  archived: z.enum(['true', 'false']).transform((value) => value === 'true').default('false'),
}).refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
  path: ['dateTo'],
  message: 'Дата окончания должна быть не раньше даты начала',
})

export const operationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  assetId: z.string().optional(),
  type: z.enum(['RECEIPT', 'TRANSFER', 'DISPOSAL', 'STATUS_CHANGE']).optional(),
})

export type TransferAssetInput = z.infer<typeof transferAssetSchema>
export type DisposeAssetInput = z.infer<typeof disposeAssetSchema>
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>
export type AssetsQuery = z.infer<typeof assetsQuerySchema>
export type OperationsQuery = z.infer<typeof operationsQuerySchema>
