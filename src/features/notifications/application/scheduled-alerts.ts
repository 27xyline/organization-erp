import {
  AppRole,
  EmployeeStatus,
  NotificationEventType,
  ProjectStatus,
  TaskStatus,
  type PrismaClient,
} from '@prisma/client'
import { addDays, startOfDay } from 'date-fns'
import { getDb } from '@/lib/prisma'
import {
  getNotificationService,
  type NotificationService,
  type PublishNotificationInput,
} from './notification.service'

export interface ScheduledAlertGenerator {
  key: string
  collect(now: Date): Promise<PublishNotificationInput[]>
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

async function scopedRoleUsers(
  db: PrismaClient,
  input:
    | { role: AppRole; departmentId: string }
    | { role: AppRole; projectId: string },
) {
  const assignment = 'departmentId' in input
    ? {
        role: { in: [AppRole.ADMIN, input.role] },
        OR: [
          { departmentScopeMode: 'ALL' as const },
          {
            departmentScopeMode: 'ASSIGNED' as const,
            departmentScopes: { some: { departmentId: input.departmentId } },
          },
        ],
      }
    : {
        role: { in: [AppRole.ADMIN, input.role] },
        OR: [
          { projectScopeMode: 'ALL' as const },
          {
            projectScopeMode: 'ASSIGNED' as const,
            projectScopes: { some: { projectId: input.projectId } },
          },
        ],
      }
  const users = await db.user.findMany({
    where: { isActive: true, roleAssignments: { some: assignment } },
    select: { id: true },
  })
  return users.map((user) => user.id)
}

export function createScheduledAlertGenerators(
  db: PrismaClient = getDb(),
): ScheduledAlertGenerator[] {
  return [
    {
      key: 'contracts',
      async collect(now) {
        const employees = await db.employee.findMany({
          where: {
            status: { not: EmployeeStatus.DISMISSED },
            contractEndDate: { gte: startOfDay(now), lte: addDays(now, 30) },
            user: { is: { isActive: true } },
          },
          select: {
            id: true,
            fullName: true,
            contractEndDate: true,
            user: { select: { id: true } },
          },
        })
        return employees.flatMap((employee) => employee.user && employee.contractEndDate ? [{
          recipientUserIds: [employee.user.id],
          eventType: NotificationEventType.CONTRACT_EXPIRING,
          title: 'Заканчивается трудовой договор',
          body: `${employee.fullName}: договор действует до ${employee.contractEndDate.toLocaleDateString('ru-RU')}`,
          dedupeKey: `contract:${employee.id}:${toDateKey(employee.contractEndDate)}`,
          targetUrl: '/employees',
          entityType: 'Employee',
          entityId: employee.id,
        }] : [])
      },
    },
    {
      key: 'tasks',
      async collect(now) {
        const tasks = await db.task.findMany({
          where: {
            endDate: { lt: startOfDay(now) },
            status: { not: TaskStatus.COMPLETED },
          },
          select: {
            id: true,
            name: true,
            endDate: true,
            projectId: true,
            assignees: {
              select: { employee: { select: { user: { select: { id: true, isActive: true } } } } },
            },
          },
        })
        return tasks.map((task) => ({
          recipientUserIds: task.assignees.flatMap(({ employee }) =>
            employee.user?.isActive ? [employee.user.id] : []
          ),
          eventType: NotificationEventType.TASK_OVERDUE,
          title: 'Просрочена задача',
          body: task.name,
          dedupeKey: `task:${task.id}:overdue:${toDateKey(task.endDate!)}`,
          targetUrl: `/projects/${task.projectId}`,
          entityType: 'Task',
          entityId: task.id,
        }))
      },
    },
    {
      key: 'assets',
      async collect(now) {
        const assets = await db.asset.findMany({
          where: {
            isArchived: false,
            plannedDisposalDate: { gte: startOfDay(now), lte: addDays(now, 30) },
          },
          select: {
            id: true,
            name: true,
            inventoryNumber: true,
            plannedDisposalDate: true,
            mol: { select: { departmentId: true } },
          },
        })
        return Promise.all(assets.map(async (asset) => ({
          recipientUserIds: await scopedRoleUsers(db, {
            role: AppRole.ASSET_CUSTODIAN,
            departmentId: asset.mol.departmentId,
          }),
          eventType: NotificationEventType.ASSET_DISPOSAL_DUE,
          title: 'Приближается срок списания имущества',
          body: `${asset.name} (${asset.inventoryNumber})`,
          dedupeKey: `asset:${asset.id}:disposal:${toDateKey(asset.plannedDisposalDate!)}`,
          targetUrl: `/assets/${asset.id}`,
          entityType: 'Asset',
          entityId: asset.id,
        })))
      },
    },
    {
      key: 'budgets',
      async collect() {
        const projects = await db.project.findMany({
          where: { status: ProjectStatus.ACTIVE, plannedBudget: { gt: 0 } },
          select: {
            id: true,
            code: true,
            name: true,
            plannedBudget: true,
            actualBudget: true,
            updatedAt: true,
          },
        })
        return Promise.all(projects
          .filter((project) => project.actualBudget.gt(project.plannedBudget))
          .map(async (project) => ({
            recipientUserIds: await scopedRoleUsers(db, {
              role: AppRole.PROJECT_MANAGER,
              projectId: project.id,
            }),
            eventType: NotificationEventType.BUDGET_OVERRUN,
            title: 'Бюджет проекта превышен',
            body: `${project.code} — ${project.name}`,
            dedupeKey: `project:${project.id}:budget:${toDateKey(project.updatedAt)}`,
            targetUrl: `/projects/${project.id}`,
            entityType: 'Project',
            entityId: project.id,
          })))
      },
    },
  ]
}

export async function generateScheduledAlerts(input?: {
  now?: Date
  actorId?: string
  requestId?: string
  generators?: ScheduledAlertGenerator[]
  notifications?: NotificationService
}) {
  const now = input?.now || new Date()
  const notifications = input?.notifications || getNotificationService()
  const generators = input?.generators || createScheduledAlertGenerators()
  const result = { generated: 0, emailQueued: 0, sources: {} as Record<string, number> }
  for (const generator of generators) {
    const alerts = await generator.collect(now)
    let generated = 0
    for (const alert of alerts) {
      const published = await notifications.publish({
        ...alert,
        actorId: input?.actorId,
        requestId: input?.requestId,
      })
      generated += published.created
      result.emailQueued += published.emailQueued
    }
    result.sources[generator.key] = generated
    result.generated += generated
  }
  return result
}
