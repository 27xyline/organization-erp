export interface PlanFactComparison {
  planned: number
  actual: number
  deviation: number
  deviationPercent: number
  status: 'UNDER_BUDGET' | 'ON_BUDGET' | 'OVER_BUDGET'
}

export interface ProfitabilityForecast {
  plannedProfit: number
  actualProfit: number
  plannedProfitabilityPercent: number
  actualProfitabilityPercent: number
  deviationPercent: number
}

export class FinanceCalculator {
  /**
   * Compare planned and actual amounts to find deviation and budget status
   */
  static comparePlanFact(planned: number, actual: number): PlanFactComparison {
    const deviation = actual - planned
    const deviationPercent = planned > 0 ? (deviation / planned) * 100 : 0
    
    let status: PlanFactComparison['status'] = 'ON_BUDGET'
    if (deviation > 0.01) {
      status = 'OVER_BUDGET'
    } else if (deviation < -0.01) {
      status = 'UNDER_BUDGET'
    }

    return {
      planned: Math.round(planned * 100) / 100,
      actual: Math.round(actual * 100) / 100,
      deviation: Math.round(deviation * 100) / 100,
      deviationPercent: Math.round(deviationPercent * 10) / 10,
      status,
    }
  }

  /**
   * Calculate planned and actual profitability and their deviation
   */
  static calculateProfitabilityForecast(
    plannedRevenue: number,
    actualRevenue: number,
    plannedCosts: number,
    actualCosts: number
  ): ProfitabilityForecast {
    const plannedProfit = plannedRevenue - plannedCosts
    const actualProfit = actualRevenue - actualCosts

    const plannedProfitabilityPercent = plannedRevenue > 0 ? (plannedProfit / plannedRevenue) * 100 : 0
    const actualProfitabilityPercent = actualRevenue > 0 ? (actualProfit / actualRevenue) * 100 : 0
    const deviationPercent = actualProfitabilityPercent - plannedProfitabilityPercent

    return {
      plannedProfit: Math.round(plannedProfit * 100) / 100,
      actualProfit: Math.round(actualProfit * 100) / 100,
      plannedProfitabilityPercent: Math.round(plannedProfitabilityPercent * 10) / 10,
      actualProfitabilityPercent: Math.round(actualProfitabilityPercent * 10) / 10,
      deviationPercent: Math.round(deviationPercent * 10) / 10,
    }
  }

  /**
   * Forecast FOT (payroll) for remaining months of a project
   */
  static forecastFOT(
    currentMonthlyFOT: number,
    remainingMonths: number,
    monthlyGrowthRatePercent = 0
  ): number {
    let totalForecast = 0
    let tempFOT = currentMonthlyFOT

    for (let i = 0; i < remainingMonths; i++) {
      totalForecast += tempFOT
      tempFOT = tempFOT * (1 + monthlyGrowthRatePercent / 100)
    }

    return Math.round(totalForecast * 100) / 100
  }
}
