import type { Prisma } from '@prisma/client'
import type { AccessContext } from '@/lib/auth/access-context'
import type { Permission } from '@/lib/auth/permissions'
import { getDb } from '@/lib/prisma'
import type { DashboardQuery } from '../contracts/dashboard'
import type { DashboardOverview } from '../contracts/view-model'
import {
  aggregateAssets,
  aggregateProjects,
  aggregateVacations,
  aggregateWorkforce,
  monthsInPeriod,
} from '../domain/aggregators'

const DAY = 24 * 60 * 60 * 1000

function utcStart(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

function utcEnd(value: string) {
  return new Date(`${value}T23:59:59.999Z`)
}

function monthKeys(from: Date, to: Date) {
  const result: Array<{ year: number; month: number }> = []
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1))
  while (cursor <= last) {
    result.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return result
}

function selectedPermission(access: AccessContext): Permission | null {
  if (access.has('employees.read')) return 'employees.read'
  if (access.has('finance.salary.read')) return 'finance.salary.read'
  return null
}

export class DashboardService {
  static async getOverview(
    query: DashboardQuery,
    access: AccessContext,
    now = new Date(),
  ): Promise<DashboardOverview> {
    const db = getDb()
    const dateFrom = utcStart(query.dateFrom)
    const dateTo = utcEnd(query.dateTo)
    const contractHorizon = new Date(now.getTime() + 90 * DAY)
    const employeePermission = selectedPermission(access)
    const projectScope = access.projectWhere('projects.read') as Prisma.ProjectWhereInput
    const employeeScope = employeePermission
      ? access.employeeWhere(employeePermission) as Prisma.EmployeeWhereInput
      : { id: '__forbidden__' }
    const assetScope = access.assetWhere('assets.read') as Prisma.AssetWhereInput
    const departmentFilter = query.departmentId ? { departmentId: query.departmentId } : {}
    const projectFilter = query.projectId ? { id: query.projectId } : {}
    const scopedProjectWhere: Prisma.ProjectWhereInput = {
      AND: [
        projectScope,
        projectFilter,
        query.departmentId
          ? { projectMembers: { some: { employee: { departmentId: query.departmentId } } } }
          : {},
      ],
    }
    const scopedEmployeeWhere: Prisma.EmployeeWhereInput = {
      AND: [employeeScope, departmentFilter],
    }
    const scopedAssetWhere: Prisma.AssetWhereInput = {
      AND: [
        assetScope,
        { isArchived: false },
        query.projectId ? { projectId: query.projectId } : {},
        query.departmentId
          ? {
              OR: [
                { mol: { departmentId: query.departmentId } },
                { holdings: { some: { quantity: { gt: 0 }, mol: { departmentId: query.departmentId } } } },
              ],
            }
          : {},
      ],
    }
    const canEmployees = Boolean(employeePermission)
    const canVacations = access.has('vacations.read')
    const canProjects = access.has('projects.read')
    const canTasks = access.has('tasks.read')
    const canAssets = access.has('assets.read')
    const canFinance = access.has('finance.salary.read') || access.has('payroll.read')
    const canStaff = access.has('staffSchedule.read') || access.has('departments.read')
    const months = monthKeys(dateFrom, dateTo)

    const [
      departments,
      projectOptions,
      employees,
      staff,
      salaries,
      projects,
      tasks,
      assets,
      assetOperations,
      personnelActions,
      auditLogs,
    ] = await Promise.all([
      access.has('departments.read')
        ? db.department.findMany({
            where: {
              AND: [
                access.departmentWhere('departments.read') as Prisma.DepartmentWhereInput,
                { isActive: true },
              ],
            },
            select: { id: true, code: true, name: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      canProjects
        ? db.project.findMany({
            where: projectScope,
            select: { id: true, code: true, name: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      canEmployees
        ? db.employee.findMany({
            where: scopedEmployeeWhere,
            select: {
              id: true,
              code: true,
              fullName: true,
              departmentId: true,
              department: true,
              status: true,
              employmentRate: true,
              contractEndDate: true,
              staffSchedule: { select: { position: true, salary: true } },
              vacations: {
                where: canVacations ? {
                  OR: [
                    { startDate: { lte: dateTo }, endDate: { gte: dateFrom } },
                    { startDate: { lte: now }, endDate: { gte: now } },
                  ],
                } : { id: '__forbidden__' },
                orderBy: { startDate: 'asc' },
              },
            },
            orderBy: { fullName: 'asc' },
          })
        : Promise.resolve([]),
      canStaff
        ? db.staffSchedule.findMany({
            where: {
              AND: [
                {
                  departmentRef: access.departmentWhere('departments.read') as Prisma.DepartmentWhereInput,
                },
                query.departmentId ? { departmentId: query.departmentId } : {},
              ],
            },
            select: { departmentId: true, rate: true },
          })
        : Promise.resolve([]),
      canFinance && employeePermission
        ? db.salaryEntry.findMany({
            where: {
              OR: months,
              employee: scopedEmployeeWhere,
            },
            select: {
              amount: true,
              employee: { select: { departmentId: true } },
            },
          })
        : Promise.resolve([]),
      canProjects
        ? db.project.findMany({
            where: {
              AND: [
                scopedProjectWhere,
                { status: 'ACTIVE' },
                { OR: [{ startDate: null }, { startDate: { lte: dateTo } }] },
                { OR: [{ endDate: null }, { endDate: { gte: dateFrom } }] },
              ],
            },
            select: {
              id: true,
              code: true,
              name: true,
              startDate: true,
              endDate: true,
              plannedBudget: true,
              actualBudget: true,
            },
            orderBy: [{ endDate: 'asc' }, { name: 'asc' }],
          })
        : Promise.resolve([]),
      canTasks
        ? db.task.findMany({
            where: {
              project: scopedProjectWhere,
            },
            select: {
              id: true,
              name: true,
              progress: true,
              status: true,
              endDate: true,
              priority: true,
              project: { select: { id: true, code: true, name: true } },
              assignees: { select: { employee: { select: { fullName: true } } } },
            },
            orderBy: { endDate: 'asc' },
          })
        : Promise.resolve([]),
      canAssets
        ? db.asset.findMany({
            where: scopedAssetWhere,
            select: {
              id: true,
              name: true,
              inventoryNumber: true,
              status: true,
              totalCost: true,
              plannedDisposalDate: true,
              mol: { select: { department: true } },
            },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
      canAssets && access.has('operations.read')
        ? db.operation.findMany({
            where: {
              asset: scopedAssetWhere,
              date: { gte: dateFrom, lte: dateTo },
            },
            select: {
              id: true,
              type: true,
              date: true,
              asset: { select: { id: true, name: true, inventoryNumber: true } },
            },
            orderBy: { date: 'desc' },
            take: 12,
          })
        : Promise.resolve([]),
      canEmployees && access.has('personnelActions.read')
        ? db.personnelAction.findMany({
            where: {
              employee: scopedEmployeeWhere,
              date: { gte: dateFrom, lte: dateTo },
            },
            select: {
              id: true,
              type: true,
              date: true,
              employee: { select: { id: true, fullName: true } },
            },
            orderBy: { date: 'desc' },
            take: 12,
          })
        : Promise.resolve([]),
      access.has('auditLogs.read')
        ? db.auditLog.findMany({
            select: {
              id: true,
              action: true,
              entityType: true,
              entityId: true,
              createdAt: true,
              user: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 12,
          })
        : Promise.resolve([]),
    ])

    const tasksByProject = new Map<string, typeof tasks>()
    for (const task of tasks) {
      const projectTasks = tasksByProject.get(task.project.id) || []
      projectTasks.push(task)
      tasksByProject.set(task.project.id, projectTasks)
    }
    const projectRows = projects.map((project) => {
      const projectTasks = tasksByProject.get(project.id) || []
      const progress = projectTasks.length
        ? Math.round(projectTasks.reduce((sum, task) => sum + task.progress, 0) / projectTasks.length)
        : 0
      return {
        ...project,
        plannedBudget: Number(project.plannedBudget),
        actualBudget: Number(project.actualBudget),
        progress,
        tasksTotal: projectTasks.length,
        tasksCompleted: projectTasks.filter((task) => task.status === 'COMPLETED').length,
      }
    })

    const workforce = aggregateWorkforce(
      employees.map((employee) => ({
        departmentId: employee.departmentId,
        department: employee.department,
        active: employee.status === 'ACTIVE',
        employmentRate: Number(employee.employmentRate),
        monthlySalary: Number(employee.staffSchedule?.salary || 0) * Number(employee.employmentRate),
      })),
      staff.map((position) => ({
        departmentId: position.departmentId,
        rate: Number(position.rate),
      })),
      salaries.map((salary) => ({
        departmentId: salary.employee.departmentId,
        amount: Number(salary.amount),
      })),
      monthsInPeriod(dateFrom, dateTo),
    )
    const projectSummary = aggregateProjects(projectRows)
    const assetSummary = aggregateAssets(assets.map((asset) => ({
      status: asset.status,
      totalCost: Number(asset.totalCost),
    })))
    const vacations = employees.flatMap((employee) =>
      employee.vacations
        .filter((vacation) => vacation.startDate <= dateTo && vacation.endDate >= dateFrom)
        .map((vacation) => ({
          id: vacation.id,
          employeeId: employee.id,
          employee: employee.fullName,
          department: employee.department,
          type: vacation.type,
          startDate: vacation.startDate,
          endDate: vacation.endDate,
        }))
    )
    const currentAbsences = employees.flatMap((employee) =>
      employee.vacations
        .filter((vacation) => vacation.startDate <= now && vacation.endDate >= now)
        .map((vacation) => ({
          id: vacation.id,
          employeeId: employee.id,
          employee: employee.fullName,
          department: employee.department,
          type: vacation.type,
          startDate: vacation.startDate,
          endDate: vacation.endDate,
        }))
    )
    const contracts = employees
      .filter((employee) => access.has('employees.read')
        &&
        employee.contractEndDate
        && employee.contractEndDate >= now
        && employee.contractEndDate <= contractHorizon
      )
      .map((employee) => ({
        id: employee.id,
        code: employee.code,
        employee: employee.fullName,
        department: employee.department,
        position: employee.staffSchedule?.position || '—',
        contractEndDate: employee.contractEndDate!,
        daysLeft: Math.ceil((employee.contractEndDate!.getTime() - now.getTime()) / DAY),
      }))
      .sort((left, right) => left.contractEndDate.getTime() - right.contractEndDate.getTime())
    const overdueTasks = tasks
      .filter((task) =>
        task.endDate
        && task.endDate < now
        && task.status !== 'COMPLETED'
        && task.progress < 100
      )
      .map((task) => ({
        id: task.id,
        name: task.name,
        project: task.project,
        progress: task.progress,
        priority: task.priority,
        endDate: task.endDate!,
        responsible: task.assignees.map((assignee) => assignee.employee.fullName).join(', ') || 'Не назначен',
        overdueDays: Math.max(1, Math.floor((now.getTime() - task.endDate!.getTime()) / DAY)),
      }))
      .sort((left, right) => right.overdueDays - left.overdueDays)
    const assetAttention = assets
      .filter((asset) =>
        asset.status === 'UNDER_REPAIR'
        || asset.status === 'PLANNED_FOR_DISPOSAL'
        || (asset.plannedDisposalDate && asset.plannedDisposalDate <= contractHorizon)
      )
      .map((asset) => ({
        ...asset,
        totalCost: Number(asset.totalCost),
      }))
    const recentActivity = [
      ...assetOperations.map((operation) => ({
        id: `asset-${operation.id}`,
        kind: 'ASSET' as const,
        title: operation.asset.name,
        description: operation.type,
        date: operation.date,
        href: `/assets/${operation.asset.id}`,
      })),
      ...personnelActions.map((action) => ({
        id: `employee-${action.id}`,
        kind: 'EMPLOYEE' as const,
        title: action.employee.fullName,
        description: action.type,
        date: action.date,
        href: `/employees/${action.employee.id}`,
      })),
      ...auditLogs.map((log) => ({
        id: `audit-${log.id}`,
        kind: 'AUDIT' as const,
        title: log.user?.name || 'Система',
        description: `${log.action} · ${log.entityType}`,
        date: log.createdAt,
        href: null,
      })),
    ].sort((left, right) => right.date.getTime() - left.date.getTime()).slice(0, 12)

    return {
      query,
      options: { departments, projects: projectOptions },
      visibility: {
        employees: canEmployees,
        projects: canProjects,
        finance: canFinance,
        assets: canAssets,
        audit: access.has('auditLogs.read'),
      },
      summary: {
        ...workforce.totals,
        occupancy: workforce.totals.staffRate > 0
          ? Math.round((workforce.totals.occupiedRate / workforce.totals.staffRate) * 1000) / 10
          : 0,
        ...projectSummary,
        assetCount: assetSummary.count,
        assetValue: assetSummary.value,
        awayNow: currentAbsences.length,
        overdueTasks: overdueTasks.length,
        assetAttention: assetAttention.length,
        contractsExpiring: contracts.length,
      },
      activeProjects: projectRows,
      currentAbsences,
      contracts,
      overdueTasks,
      assetAttention,
      recentActivity,
      analytics: {
        workforceByDepartment: workforce.rows,
        projects: projectRows,
        assetsByStatus: assetSummary.byStatus,
        vacationsByType: aggregateVacations(vacations.map((vacation) => vacation.type)),
        vacations,
      },
    }
  }
}
