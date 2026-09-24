import { describe, expect, it } from 'vitest'
import { summarizeAssetInventoryEntries } from './asset-inventory-summary'

describe('summarizeAssetInventoryEntries', () => {
  it('separates unchecked assets from quantity differences and sums decimal quantities', () => {
    const summary = summarizeAssetInventoryEntries([
      { expectedQuantity: '2.00', foundQuantity: null },
      { expectedQuantity: '1.00', foundQuantity: '1.00' },
      { expectedQuantity: '3.00', foundQuantity: '2.00' },
      { expectedQuantity: '0.50', foundQuantity: '0.75' },
    ])

    expect(summary).toEqual({
      totalAssets: 4,
      checkedAssets: 3,
      missingAssets: 1,
      quantityDiscrepancies: 2,
      totalDiscrepancies: 3,
      expectedQuantityTotal: '6.50',
      foundQuantityTotal: '3.75',
    })
  })

  it('treats a scanned zero quantity as a checked asset', () => {
    expect(summarizeAssetInventoryEntries([
      { expectedQuantity: '1.00', foundQuantity: '0.00' },
    ])).toMatchObject({
      checkedAssets: 1,
      missingAssets: 0,
      quantityDiscrepancies: 1,
      foundQuantityTotal: '0.00',
    })
  })
})
