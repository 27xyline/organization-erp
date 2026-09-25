import { ApprovalRequestStatus, ApprovalStepStatus, AssetInventoryStatus, EmployeeStatus, Prisma, TaskStatus, type PrismaClient } from '@prisma/client'
import type { CurrentUser } from '@/lib/auth/authorization'
import { getDb } from '@/lib/prisma'
import type { MyAction, MyActionsResult } from '../contracts/view-model'

const DAY = 24 * 60 * 60 * 1000

function urgency(dueAt: Date | null, now: Date, fallback: number): number {
  if (!dueAt) return fallback
  if (dueAt.getTime() < now.getTime()) return 0
  if (dueAt.getTime() < now.getTime() + 3 * DAY) return 1
  if (dueAt.getTime() < now.getTime() + 14 * DAY) return 2
  return fallback
}

export class MyActionsService {
  constructor(private readonly db: PrismaClient = getDb()) {}

  async getForUser(user: CurrentUser, now = new Date()): Promise<MyActionsResult> {
    const employeeId = user.access.identity.employeeId
    const taskWhere: Prisma.TaskWhereInput = {
      status: { not: TaskStatus.COMPLETED },
      assignees: { some: { employeeId: employeeId || '__no_employee__' } },
      project: { is: user.access.projectWhere('tasks.read') as Prisma.ProjectWhereInput },
    }
    const departmentIds = user.access.allowedDepartmentIds('assets.inventory.manage')
    const discrepancyWhere: Prisma.AssetInventoryEntryWhereInput = {
      foundQuantity: { not: null },
      NOT: { foundQuantity: { equals: this.db.assetInventoryEntry.fields.expectedQuantity } },
      inventory: {
        is: {
          status: AssetInventoryStatus.IN_PROGRESS,
          mol: {
            is: {
              departmentRef: { is: { isActive: true } },
              ...(departmentIds ? { departmentId: { in: departmentIds } } : {}),
            },
          },
        },
      },
    }

    const [tasks, taskCount, approvals, discrepancies, discrepancyCount, contract] = await Promise.all([
      user.access.has('tasks.read') && employeeId
        ? this.db.task.findMany({
            where: taskWhere,
            select: { id: true, name: true, priority: true, endDate: true, projectId: true, project: { select: { code: true } } },
            orderBy: [{ endDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
            take: 12,
          })
        : Promise.resolve([]),
      user.access.has('tasks.read') && employeeId ? this.db.task.count({ where: taskWhere }) : Promise.resolve(0),
      user.access.has('approvals.decide')
        ? this.db.approvalRequest.findMany({
            where: {
              status: ApprovalRequestStatus.PENDING,
              steps: { some: { approverId: user.id, status: ApprovalStepStatus.PENDING } },
            },
            select: {
              id: true, title: true, dueAt: true, currentStep: true,
              steps: { where: { approverId: user.id, status: ApprovalStepStatus.PENDING }, select: { sequence: true, name: true } },
            },
            orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      user.access.has('assets.inventory.manage') && (departmentIds === null || departmentIds.length > 0)
        ? this.db.assetInventoryEntry.findMany({
            where: discrepancyWhere,
            select: { id: true, assetName: true, inventoryId: true, inventory: { select: { name: true } } },
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
            take: 12,
          })
        : Promise.resolve([]),
      user.access.has('assets.inventory.manage') && (departmentIds === null || departmentIds.length > 0)
        ? this.db.assetInventoryEntry.count({ where: discrepancyWhere })
        : Promise.resolve(0),
      user.access.has('employees.read') && employeeId
        ? this.db.employee.findFirst({
            where: { id: employeeId, status: { not: EmployeeStatus.DISMISSED }, contractEndDate: { lte: new Date(now.getTime() + 90 * DAY) } },
            select: { id: true, contractEndDate: true },
          })
        : Promise.resolve(null),
    ])

    const currentApprovals = approvals.flatMap((request) => {
      const step = request.steps.find((candidate) => candidate.sequence === request.currentStep)
      return step ? [{ ...request, step }] : []
    })
    const items: MyAction[] = [
      ...tasks.map((task) => ({
        id: `task:${task.id}`, kind: 'task' as const, title: task.name,
        detail: `Задача · ${task.project.code}`,
        href: `/projects/${task.projectId}?tab=tasks`, dueAt: task.endDate,
        urgency: urgency(task.endDate, now, task.priority === 'CRITICAL' ? 1 : task.priority === 'HIGH' ? 2 : 3),
      })),
      ...currentApprovals.map((request) => ({
        id: `approval:${request.id}`, kind: 'approval' as const, title: request.title,
        detail: `Согласование · ${request.step.name}`,
        href: `/approvals/${request.id}`, dueAt: request.dueAt,
        urgency: urgency(request.dueAt, now, 2),
      })),
      ...discrepancies.map((entry) => ({
        id: `inventory:${entry.id}`, kind: 'inventory' as const, title: entry.assetName,
        detail: `Расхождение · ${entry.inventory.name}`,
        href: `/assets/inventory/${entry.inventoryId}`, dueAt: null,
        urgency: 2,
      })),
      ...(contract?.contractEndDate ? [{
        id: `contract:${contract.id}`, kind: 'contract' as const, title: 'Истекает трудовой договор',
        detail: 'Личный срок', href: `/employees/${contract.id}`,
        dueAt: contract.contractEndDate, urgency: urgency(contract.contractEndDate, now, 3),
      }] : []),
    ]
    items.sort((left, right) => left.urgency - right.urgency
      || (left.dueAt?.getTime() ?? Infinity) - (right.dueAt?.getTime() ?? Infinity)
      || left.id.localeCompare(right.id))
    return { items: items.slice(0, 10), total: taskCount + currentApprovals.length + discrepancyCount + (contract ? 1 : 0) }
  }
}
