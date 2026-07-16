import { describe, expect, it } from 'vitest'
import { FinancePlanType } from '@prisma/client'
import {
  buildNormalizedAllocations,
  calculateBudgetAdjustments,
} from '@/features/finance/domain/finance-plan'

describe('finance-plan.service helpers', () => {
  it('requires project for oklad allocation', () => {
    expect(() => buildNormalizedAllocations({
      type: FinancePlanType.OKLAD,
      employeeSalary: 1000,
      employeeRate: 1,
    })).toThrowError('PROJECT_REQUIRED')
  })

  it('aggregates duplicate nadbavka allocations by project', () => {
    expect(buildNormalizedAllocations({
      type: FinancePlanType.NADBAVKA,
      employeeSalary: 0,
      employeeRate: 0,
      rawAllocations: [
        { projectId: 'p1', amount: '100' },
        { projectId: 'p1', amount: '50.5' },
        { projectId: 'p2', amount: '25,25' },
      ],
    })).toEqual([
      { projectId: 'p1', amount: '150.50' },
      { projectId: 'p2', amount: '25.25' },
    ])
  })

  it('rejects invalid nadbavka amount', () => {
    expect(() => buildNormalizedAllocations({
      type: FinancePlanType.NADBAVKA,
      employeeSalary: 0,
      employeeRate: 0,
      rawAllocations: [
        { projectId: 'p1', amount: '-1' },
      ],
    })).toThrowError('INVALID_FINANCE_AMOUNT')
  })

  it('calculates decrement and increment budgets for repeated save', () => {
    const adjustments = calculateBudgetAdjustments(
      [
        { projectId: 'p1', amount: 100 },
        { projectId: 'p2', amount: 50 },
      ],
      [
        { projectId: 'p1', amount: '70.00' },
        { projectId: 'p3', amount: '30.00' },
      ]
    )

    expect(Array.from(adjustments.decrements.entries())).toEqual([
      ['p1', '30.00'],
      ['p2', '50.00'],
    ])
    expect(Array.from(adjustments.increments.entries())).toEqual([
      ['p3', '30.00'],
    ])
  })
})
