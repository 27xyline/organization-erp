import { describe, expect, it } from 'vitest'
import { FinanceCalculator } from '../finance-calculator'

describe('FinanceCalculator', () => {
  it('compares plan and fact budgets correctly', () => {
    const result = FinanceCalculator.comparePlanFact(1000, 1200)
    expect(result.deviation).toBe(200)
    expect(result.deviationPercent).toBe(20.0)
    expect(result.status).toBe('OVER_BUDGET')
  })

  it('calculates profitability forecasts correctly', () => {
    const result = FinanceCalculator.calculateProfitabilityForecast(
      1000000, // planned revenue
      800000,  // actual revenue
      600000,  // planned costs
      500000   // actual costs
    )
    expect(result.plannedProfit).toBe(400000)
    expect(result.actualProfit).toBe(300000)
    expect(result.plannedProfitabilityPercent).toBe(40.0)
    expect(result.actualProfitabilityPercent).toBe(37.5)
    expect(result.deviationPercent).toBe(-2.5)
  })

  it('forecasts FOT with growth rate', () => {
    const result = FinanceCalculator.forecastFOT(100000, 3, 5) // 5% growth
    // Month 1: 100,000
    // Month 2: 105,000
    // Month 3: 110,250
    // Total: 315,250
    expect(result).toBe(315250)
  })
})
