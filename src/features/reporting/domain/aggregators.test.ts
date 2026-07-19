import { describe, expect, it } from 'vitest'
import {
  aggregateAssets,
  aggregateProjects,
  aggregateVacations,
  aggregateWorkforce,
  monthsInPeriod,
  percent,
} from './aggregators'

describe('reporting aggregators', () => {
  it('calculates stable percentages and inclusive month ranges', () => {
    expect(percent(1, 4)).toBe(25)
    expect(percent(1, 0)).toBe(0)
    expect(monthsInPeriod(new Date('2026-01-01'), new Date('2026-03-31'))).toBe(3)
  })

  it('groups workforce, rates and FOT by department', () => {
    const report = aggregateWorkforce(
      [
        { departmentId: 'd1', department: 'ИТ', active: true, employmentRate: 1, monthlySalary: 100_000 },
        { departmentId: 'd1', department: 'ИТ', active: false, employmentRate: 0.5, monthlySalary: 40_000 },
      ],
      [{ departmentId: 'd1', rate: 2 }],
      [{ departmentId: 'd1', amount: 125_000 }],
      2,
    )
    expect(report.rows[0]).toMatchObject({
      headcount: 2,
      active: 1,
      occupiedRate: 1.5,
      staffRate: 2,
      occupancy: 75,
      plannedFot: 280_000,
      actualFot: 125_000,
    })
  })

  it('summarizes project plan-fact and progress', () => {
    expect(aggregateProjects([
      { plannedBudget: 1_000, actualBudget: 900, progress: 40 },
      { plannedBudget: 2_000, actualBudget: 2_100, progress: 80 },
    ])).toEqual({
      count: 2,
      plannedBudget: 3_000,
      actualBudget: 3_000,
      variance: 0,
      budgetUsage: 100,
      averageProgress: 60,
    })
  })

  it('groups asset value and vacation types', () => {
    expect(aggregateAssets([
      { status: 'IN_USE', totalCost: 200 },
      { status: 'IN_USE', totalCost: 300 },
      { status: 'UNDER_REPAIR', totalCost: 100 },
    ])).toMatchObject({ count: 3, value: 600 })
    expect(aggregateVacations(['VACATION', 'SICK_LEAVE', 'VACATION'])).toEqual([
      { type: 'VACATION', count: 2 },
      { type: 'SICK_LEAVE', count: 1 },
    ])
  })
})

