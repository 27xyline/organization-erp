import { describe, expect, it } from 'vitest'
import { calculatePayroll } from './payroll-calculator'

describe('payroll calculator', () => {
  it('calculates tax, contributions and plan variance', () => {
    expect(calculatePayroll({
      plannedBase: 100_000,
      plannedAllowance: 10_000,
      actualBase: 100_000,
      allowance: 10_000,
      bonus: 20_000,
      oneTime: 0,
      deduction: 5_000,
    })).toEqual({
      plannedGross: 110_000,
      gross: 125_000,
      tax: 16_250,
      contributions: 37_500,
      payable: 108_750,
      employerCost: 162_500,
      variance: 15_000,
    })
  })

  it('never produces a negative gross amount', () => {
    expect(calculatePayroll({
      plannedBase: 0,
      plannedAllowance: 0,
      actualBase: 10_000,
      allowance: 0,
      bonus: 0,
      oneTime: 0,
      deduction: 20_000,
    }).gross).toBe(0)
  })
})
