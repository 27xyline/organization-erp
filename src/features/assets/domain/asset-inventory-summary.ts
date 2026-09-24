import { Prisma } from '@prisma/client'

type QuantityValue = Prisma.Decimal | string | number

export interface AssetInventoryQuantityEntry {
  expectedQuantity: QuantityValue
  foundQuantity: QuantityValue | null
}

export interface AssetInventorySummary {
  totalAssets: number
  checkedAssets: number
  missingAssets: number
  quantityDiscrepancies: number
  totalDiscrepancies: number
  expectedQuantityTotal: string
  foundQuantityTotal: string
}

export function summarizeAssetInventoryEntries(
  entries: readonly AssetInventoryQuantityEntry[],
): AssetInventorySummary {
  let checkedAssets = 0
  let quantityDiscrepancies = 0
  let expectedQuantityTotal = new Prisma.Decimal(0)
  let foundQuantityTotal = new Prisma.Decimal(0)

  for (const entry of entries) {
    const expected = new Prisma.Decimal(entry.expectedQuantity)
    expectedQuantityTotal = expectedQuantityTotal.add(expected)
    if (entry.foundQuantity === null) continue

    checkedAssets += 1
    const found = new Prisma.Decimal(entry.foundQuantity)
    foundQuantityTotal = foundQuantityTotal.add(found)
    if (!found.equals(expected)) quantityDiscrepancies += 1
  }

  const missingAssets = entries.length - checkedAssets
  return {
    totalAssets: entries.length,
    checkedAssets,
    missingAssets,
    quantityDiscrepancies,
    totalDiscrepancies: missingAssets + quantityDiscrepancies,
    expectedQuantityTotal: expectedQuantityTotal.toFixed(2),
    foundQuantityTotal: foundQuantityTotal.toFixed(2),
  }
}
