import { describe, expect, it } from 'vitest'
import { calculateLaborAmounts, standardMonthlyHours } from './labor-calculator'

describe('labor calculator', () => {
  it('counts only weekdays in the monthly norm', () => {
    expect(standardMonthlyHours(2026, 7)).toBe(184)
  })

  it('respects employment-rate-adjusted base salary and overtime premium', () => {
    expect(calculateLaborAmounts({
      baseSalary: 50_000,
      normativeHours: 160,
      paidHours: 160,
      overtimeHours: 8,
      projectHours: 80,
      projectOvertimeHours: 8,
    })).toEqual({
      calculatedSalary: 53_750,
      projectCost: 28_750,
    })
  })

  it('prorates salary for an incomplete month', () => {
    expect(calculateLaborAmounts({
      baseSalary: 100_000,
      normativeHours: 160,
      paidHours: 80,
      overtimeHours: 0,
      projectHours: 0,
      projectOvertimeHours: 0,
    }).calculatedSalary).toBe(50_000)
  })
})
