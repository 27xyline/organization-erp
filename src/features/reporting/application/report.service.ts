import { getDb } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { monthsInPeriod, percent } from '../domain/aggregators'
import type { ReportPresetInput } from '../contracts/report-presets'

export class ReportService {
  // 1. Turnover Report
  static async getTurnoverReport(dateFrom: Date, dateTo: Date, departmentId?: string) {
    const db = getDb()
    const deptFilter = departmentId ? { departmentId } : {}

    const dismissActions = await db.personnelAction.findMany({
      where: {
        type: 'DISMISS',
        date: { gte: dateFrom, lte: dateTo },
        employee: deptFilter,
      },
      select: { employeeId: true },
    })
    const dismissedCount = dismissActions.length

    const hireActions = await db.personnelAction.findMany({
      where: {
        type: 'HIRE',
        date: { gte: dateFrom, lte: dateTo },
        employee: deptFilter,
      },
      select: { employeeId: true },
    })
    const hiredCount = hireActions.length

    const employees = await db.employee.findMany({
      where: deptFilter,
      select: {
        id: true,
        status: true,
        contractSignedDate: true,
        contractEndDate: true,
        actions: {
          where: {
            type: { in: ['HIRE', 'DISMISS'] },
          },
          select: {
            type: true,
            date: true,
          },
        },
      },
    })

    let activeAtStart = 0
    let activeAtEnd = 0

    for (const emp of employees) {
      const hireAction = emp.actions.find((a) => a.type === 'HIRE')
      const hireDate = hireAction?.date || emp.contractSignedDate

      const dismissAction = emp.actions.find((a) => a.type === 'DISMISS')
      const dismissDate = dismissAction?.date || emp.contractEndDate

      if (hireDate && hireDate <= dateFrom) {
        if (!dismissDate || dismissDate > dateFrom) {
          activeAtStart++
        }
      }

      if (hireDate && hireDate <= dateTo) {
        if (!dismissDate || dismissDate > dateTo) {
          activeAtEnd++
        }
      }
    }

    const averageHeadcount = (activeAtStart + activeAtEnd) / 2
    const turnoverRate = averageHeadcount > 0 ? (dismissedCount / averageHeadcount) * 100 : 0

    return {
      activeAtStart,
      activeAtEnd,
      dismissedCount,
      hiredCount,
      averageHeadcount,
      turnoverRate: Math.round(turnoverRate * 10) / 10,
    }
  }

  // 2. Project Profitability
  static async getProjectProfitability(dateFrom: Date, dateTo: Date, projectId?: string) {
    const db = getDb()

    const projects = await db.project.findMany({
      where: projectId ? { id: projectId } : { status: 'ACTIVE' },
      select: {
        id: true,
        code: true,
        name: true,
        plannedBudget: true,
        actualBudget: true,
        plannedRevenue: true,
        actualRevenue: true,
        financePlanEntries: {
          select: {
            year: true,
            month: true,
            amount: true,
          },
        },
        procurementRequests: {
          select: {
            contract: {
              select: {
                amount: true,
              },
            },
          },
        },
      },
    })

    return projects.map((proj) => {
      const projectPayroll = proj.financePlanEntries
        .filter((entry) => {
          const entryDate = new Date(Date.UTC(entry.year, entry.month - 1, 15))
          return entryDate >= dateFrom && entryDate <= dateTo
        })
        .reduce((sum, entry) => sum + Number(entry.amount), 0)

      const procurementCost = proj.procurementRequests.reduce(
        (sum, req) => sum + Number(req.contract?.amount || 0),
        0,
      )

      const totalCost = projectPayroll + procurementCost

      const pRev = Number(proj.plannedRevenue || proj.plannedBudget)
      const aRev = Number(proj.actualRevenue || proj.actualBudget)

      const profit = aRev - totalCost
      const marginPercent = aRev > 0 ? (profit / aRev) * 100 : 0

      return {
        id: proj.id,
        code: proj.code,
        name: proj.name,
        plannedRevenue: pRev,
        actualRevenue: aRev,
        payrollCost: projectPayroll,
        procurementCost,
        totalCost,
        profit,
        profitabilityRate: Math.round(marginPercent * 10) / 10,
      }
    })
  }

  // 3. Asset Depreciation & Movement
  static async getAssetDepreciationReport(dateFrom: Date, dateTo: Date, departmentId?: string) {
    const db = getDb()

    const assets = await db.asset.findMany({
      where: {
        isArchived: false,
        ...(departmentId ? { mol: { departmentId } } : {}),
      },
      select: {
        id: true,
        name: true,
        inventoryNumber: true,
        totalCost: true,
        initialCost: true,
        usefulLifeMonths: true,
        recordingDate: true,
        mol: {
          select: {
            fullName: true,
            department: true,
          },
        },
      },
    })

    const rows = assets.map((asset) => {
      const initCost = Number(asset.initialCost) > 0 ? Number(asset.initialCost) : Number(asset.totalCost)
      const usefulMonths = asset.usefulLifeMonths || 60

      const startDate = asset.recordingDate > dateFrom ? asset.recordingDate : dateFrom
      if (startDate > dateTo) {
        return {
          id: asset.id,
          name: asset.name,
          inventoryNumber: asset.inventoryNumber,
          initialCost: initCost,
          depreciation: 0,
          residualValue: initCost,
          mol: asset.mol.fullName,
          department: asset.mol.department,
        }
      }

      const activeMonths = monthsInPeriod(startDate, dateTo)
      const monthlyAmount = initCost / usefulMonths
      const depreciation = Math.min(initCost, monthlyAmount * activeMonths)
      const residualValue = initCost - depreciation

      return {
        id: asset.id,
        name: asset.name,
        inventoryNumber: asset.inventoryNumber,
        initialCost: initCost,
        depreciation: Math.round(depreciation * 100) / 100,
        residualValue: Math.round(residualValue * 100) / 100,
        mol: asset.mol.fullName,
        department: asset.mol.department,
      }
    })

    const movements = await db.operation.findMany({
      where: {
        date: { gte: dateFrom, lte: dateTo },
        type: { in: ['TRANSFER', 'RECEIPT', 'DISPOSAL'] },
      },
      include: {
        asset: { select: { name: true, inventoryNumber: true } },
        fromMol: { select: { fullName: true } },
        toMol: { select: { fullName: true } },
      },
      orderBy: { date: 'desc' },
    })

    return {
      assets: rows,
      movements: movements.map((m) => ({
        id: m.id,
        date: m.date,
        type: m.type,
        assetName: m.asset.name,
        inventoryNumber: m.asset.inventoryNumber,
        fromMol: m.fromMol?.fullName || '—',
        toMol: m.toMol?.fullName || '—',
        quantity: Number(m.quantity),
        reason: m.reason || '—',
      })),
    }
  }

  // 4. Vacation Calendar
  static async getVacationCalendar(dateFrom: Date, dateTo: Date, departmentId?: string) {
    const db = getDb()

    const vacations = await db.vacation.findMany({
      where: {
        startDate: { lte: dateTo },
        endDate: { gte: dateFrom },
        employee: departmentId ? { departmentId } : {},
      },
      include: {
        employee: {
          select: {
            fullName: true,
            department: true,
          },
        },
      },
      orderBy: { startDate: 'asc' },
    })

    return vacations.map((v) => ({
      id: v.id,
      employeeName: v.employee.fullName,
      department: v.employee.department,
      startDate: v.startDate,
      endDate: v.endDate,
      type: v.type,
      durationDays: Math.round((v.endDate.getTime() - v.startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1,
    }))
  }

  // 5. Saved Presets Management
  static async listPresets(userId: string) {
    const db = getDb()
    return db.reportPreset.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  static async savePreset(userId: string, input: ReportPresetInput) {
    const db = getDb()
    return db.reportPreset.create({
      data: {
        name: input.name,
        metrics: input.metrics,
        groupBy: input.groupBy || null,
        filters: (input.filters as any) || undefined,
        createdById: userId,
      },
    })
  }

  static async deletePreset(userId: string, presetId: string) {
    const db = getDb()
    return db.reportPreset.delete({
      where: { id: presetId, createdById: userId },
    })
  }

  // 6. Custom Constructor Report
  static async getCustomReport(
    preset: ReportPresetInput,
    dateFrom: Date,
    dateTo: Date,
    departmentId?: string,
    projectId?: string,
  ) {
    const db = getDb()
    const months = monthsInPeriod(dateFrom, dateTo)

    const deptFilter = departmentId ? { departmentId } : {}
    const projFilter = projectId ? { projectId } : {}

    if (preset.groupBy === 'department') {
      const departments = await db.department.findMany({
        where: { isActive: true, ...(departmentId ? { id: departmentId } : {}) },
        include: {
          employees: {
            where: { status: { not: 'DISMISSED' } },
            select: {
              id: true,
              employmentRate: true,
              staffSchedule: { select: { salary: true } },
            },
          },
          mols: {
            include: {
              assets: {
                where: { isArchived: false, ...(projectId ? { projectId } : {}) },
                select: { totalCost: true, recordingDate: true },
              },
            },
          },
        },
      })

      return departments.map((dept) => {
        const row: Record<string, any> = {
          groupKey: dept.id,
          groupName: dept.name,
        }

        if (preset.metrics.includes('headcount')) {
          row.headcount = dept.employees.length
        }

        if (preset.metrics.includes('occupiedRate')) {
          row.occupiedRate = dept.employees.reduce((sum, e) => sum + Number(e.employmentRate), 0)
        }

        if (preset.metrics.includes('plannedFot')) {
          row.plannedFot = dept.employees.reduce(
            (sum, e) => sum + Number(e.staffSchedule?.salary || 0) * Number(e.employmentRate) * months,
            0,
          )
        }

        if (preset.metrics.includes('assetValue')) {
          row.assetValue = dept.mols.reduce(
            (sum, mol) => sum + mol.assets.reduce((valSum, asset) => valSum + Number(asset.totalCost), 0),
            0,
          )
        }

        return row
      })
    } else if (preset.groupBy === 'project') {
      const projects = await db.project.findMany({
        where: { ...(projectId ? { id: projectId } : { status: 'ACTIVE' }) },
        include: {
          financePlanEntries: {
            select: { amount: true, year: true, month: true },
          },
          assets: {
            where: { isArchived: false },
            select: { totalCost: true },
          },
        },
      })

      return projects.map((proj) => {
        const row: Record<string, any> = {
          groupKey: proj.id,
          groupName: `${proj.code} — ${proj.name}`,
        }

        if (preset.metrics.includes('projectBudget')) {
          row.plannedBudget = Number(proj.plannedBudget)
          row.actualBudget = Number(proj.actualBudget)
        }

        if (preset.metrics.includes('actualFot')) {
          row.actualFot = proj.financePlanEntries
            .filter((entry) => {
              const entryDate = new Date(Date.UTC(entry.year, entry.month - 1, 15))
              return entryDate >= dateFrom && entryDate <= dateTo
            })
            .reduce((sum, entry) => sum + Number(entry.amount), 0)
        }

        if (preset.metrics.includes('assetValue')) {
          row.assetValue = proj.assets.reduce((sum, asset) => sum + Number(asset.totalCost), 0)
        }

        return row
      })
    }

    return []
  }
}
