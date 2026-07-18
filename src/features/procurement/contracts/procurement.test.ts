import { describe, expect, it } from 'vitest'
import {
  contractSchema,
  createProcurementSchema,
  deliverySchema,
  supplierSchema,
} from './procurement'

const request = {
  number: 'ЗК-2026-001',
  title: 'Комплект измерительного оборудования',
  budgetLimit: 500_000,
  items: [{
    name: 'Анализатор спектра',
    quantity: 1,
    unit: 'шт.',
    unitPrice: 450_000,
  }],
}

describe('procurement contracts', () => {
  it('accepts a request within its budget limit', () => {
    expect(createProcurementSchema.safeParse(request).success).toBe(true)
  })

  it('rejects positions exceeding the budget limit', () => {
    const result = createProcurementSchema.safeParse({
      ...request,
      budgetLimit: 400_000,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.budgetLimit).toContain(
        'Стоимость позиций превышает бюджетный лимит',
      )
    }
  })

  it('does not accept a delivery deadline before signing', () => {
    expect(contractSchema.safeParse({
      supplierId: 'supplier-1',
      number: 'Д-001',
      amount: 450_000,
      signedAt: '2026-07-20',
      deliveryDueAt: '2026-07-19',
    }).success).toBe(false)
  })

  it('validates delivery quantities and supplier tax ids', () => {
    expect(deliverySchema.safeParse({
      number: 'УПД-001',
      receivedAt: '2026-07-25',
      items: [{ procurementItemId: 'item-1', quantity: 0 }],
    }).success).toBe(false)
    expect(supplierSchema.safeParse({ name: 'ООО ЛабСнаб', taxId: '7701234567' }).success).toBe(true)
    expect(supplierSchema.safeParse({ name: 'ООО ЛабСнаб', taxId: '123' }).success).toBe(false)
  })
})
