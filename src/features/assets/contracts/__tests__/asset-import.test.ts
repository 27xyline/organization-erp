import { describe, expect, it } from 'vitest'
import { assetImportCommitSchema } from '../asset-import'

const asset = {
  name: 'Ноутбук',
  inventoryNumber: 'INV-1',
  unitPrice: 1200,
  unitOfMeasure: 'шт',
  quantity: 1,
  molId: 'mol-1',
  groupId: 'group-1',
  recordingDate: '2026-07-16',
  documentType: 'Накладная',
  documentDetails: '№ 7',
}

describe('assetImportCommitSchema', () => {
  it('forces imported assets into the initial in-stock state', () => {
    const result = assetImportCommitSchema.parse({
      assets: [{
        ...asset,
        status: 'FULLY_DISPOSED',
        projectId: 'unauthorized-project',
        photos: ['https://example.test/photo.jpg'],
        documentFiles: ['https://example.test/document.pdf'],
        plannedDisposalReason: 'Forged input',
      }],
    })

    expect(result.assets[0]).toMatchObject({
      status: 'IN_STOCK',
      projectId: null,
      photos: [],
      documentFiles: [],
      plannedDisposalDate: null,
      plannedDisposalReason: null,
    })
  })

  it('rejects a batch larger than the import limit and top-level fields outside the contract', () => {
    expect(assetImportCommitSchema.safeParse({ assets: Array(101).fill(asset) }).success).toBe(false)
    expect(assetImportCommitSchema.safeParse({ assets: [asset], ignored: true }).success).toBe(false)
  })

  it('rejects invalid calendar dates, excess decimal places, and database-overflowing values', () => {
    expect(assetImportCommitSchema.safeParse({ assets: [{ ...asset, recordingDate: '2026-02-30' }] }).success).toBe(false)
    expect(assetImportCommitSchema.safeParse({ assets: [{ ...asset, unitPrice: 10.123 }] }).success).toBe(false)
    expect(assetImportCommitSchema.safeParse({ assets: [{ ...asset, unitPrice: 100_000_000 }] }).success).toBe(false)
  })
})
