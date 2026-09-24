import { z } from 'zod'
import type { CreateAssetInput } from './schemas'
import { createAssetSchema } from './schemas'

export const MAX_ASSET_IMPORT_ROWS = 100
export const MAX_ASSET_IMPORT_FILE_BYTES = 5 * 1024 * 1024

const importAssetSchema = createAssetSchema
  .omit({
    projectId: true,
    status: true,
    documentFiles: true,
    plannedDisposalDate: true,
    plannedDisposalReason: true,
    photos: true,
  })
  .superRefine((input, context) => {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.recordingDate)
    const date = dateMatch
      ? new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])))
      : null
    if (!dateMatch || !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.recordingDate) {
      context.addIssue({ code: 'custom', path: ['recordingDate'], message: 'Укажите корректную дату в формате ГГГГ-ММ-ДД' })
    }
    const unitPrice = input.unitPrice
    const quantity = input.quantity
    if (Number(unitPrice.toFixed(2)) !== unitPrice) {
      context.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Допустимо не более двух знаков после запятой' })
    }
    if (Number(quantity.toFixed(2)) !== quantity) {
      context.addIssue({ code: 'custom', path: ['quantity'], message: 'Допустимо не более двух знаков после запятой' })
    }
    if (unitPrice > 99_999_999.99) {
      context.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Цена превышает допустимый предел' })
    }
    if (quantity > 99_999_999.99) {
      context.addIssue({ code: 'custom', path: ['quantity'], message: 'Количество превышает допустимый предел' })
    }
    if (unitPrice * quantity > 9_999_999_999.99) {
      context.addIssue({ code: 'custom', path: ['unitPrice'], message: 'Итоговая стоимость превышает допустимый предел' })
    }
  })
  .transform((input) => ({
    ...input,
    inventoryNumber: input.inventoryNumber.trim(),
    name: input.name.trim(),
    unitOfMeasure: input.unitOfMeasure.trim(),
    molId: input.molId.trim(),
    groupId: input.groupId.trim(),
    documentType: input.documentType.trim(),
    documentDetails: input.documentDetails.trim(),
    contractCode: input.contractCode?.trim(),
    internalFundingCode: input.internalFundingCode?.trim(),
    notes: input.notes?.trim(),
  }))
  .pipe(createAssetSchema)
  .transform((input) => ({
    ...input,
    projectId: null,
    status: 'IN_STOCK' as const,
    documentFiles: [],
    plannedDisposalDate: null,
    plannedDisposalReason: null,
    photos: [],
  }))

export const assetImportCommitSchema = z.object({
  assets: z.array(importAssetSchema).min(1).max(MAX_ASSET_IMPORT_ROWS),
}).strict()

export interface AssetImportPreviewRow {
  rowNumber: number
  inventoryNumber: string
  name: string
  molCode: string
  groupCode: string
  quantity: string
  unitPrice: string
  unitOfMeasure: string
  input?: CreateAssetInput
  errors: string[]
}
