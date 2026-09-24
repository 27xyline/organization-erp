import { describe, expect, it } from 'vitest'
import {
  createAssetInventorySchema,
  recordAssetInventoryCountSchema,
} from './inventory'

describe('asset inventory contracts', () => {
  it('trims the inventory name and requires a responsible storage location', () => {
    expect(createAssetInventorySchema.parse({ name: '  Осенняя проверка  ', molId: 'mol-7' }))
      .toEqual({ name: 'Осенняя проверка', molId: 'mol-7' })
    expect(createAssetInventorySchema.safeParse({ name: 'План', molId: '' }).success).toBe(false)
  })

  it('accepts a zero physical count and trims a scanned inventory number', () => {
    expect(recordAssetInventoryCountSchema.parse({
      inventoryNumber: '  INV-0007 ',
      foundQuantity: 0,
    })).toEqual({ inventoryNumber: 'INV-0007', foundQuantity: 0 })
  })

  it('accepts common two-decimal quantities despite floating point representation', () => {
    expect(recordAssetInventoryCountSchema.safeParse({
      inventoryNumber: 'INV-0007',
      foundQuantity: 1.15,
    }).success).toBe(true)
  })

  it('rejects negative, oversized, and fractional precision beyond the ledger scale', () => {
    for (const foundQuantity of [-1, 100_000_000, 1.001]) {
      expect(recordAssetInventoryCountSchema.safeParse({
        inventoryNumber: 'INV-0007',
        foundQuantity,
      }).success).toBe(false)
    }
  })
})
