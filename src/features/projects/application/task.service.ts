import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { CreateTaskInput, UpdateTaskInput } from '../contracts/task'
import {
  ensureAcyclicDependencies,
  ensureValidTaskHierarchy,
  TaskServiceError,
} from '../domain/task-rules'

export { TaskServiceError } from '../domain/task-rules'

const taskAssigneeInclude = {
  assignees: {
    include: {
      employee: { select: { id: true, fullName: true } },
      projectMember: { select: { id: true } },
    },
  },
  predecessors: {
    include: { predecessor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
  checklist: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
  comments: {
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  },
} satisfies Prisma.TaskInclude

const nestedTaskInclude = {
  ...taskAssigneeInclude,
  children: { include: { ...taskAssigneeInclude, children: { include: taskAssigneeInclude } } },
} satisfies Prisma.TaskInclude

function mapTask<T extends { assignees: Array<{ employeeId: string; projectMemberId: string | null; employee: { fullName: string } }> }>(task: T) {
  return {
    ...task,
    assignees: task.assignees.map((assignee) => ({
      employeeId: assignee.employeeId,
      fullName: assignee.employee.fullName,
      projectMemberId: assignee.projectMemberId,
    })),
  }
}

async function activeMembers(projectId: string, employeeIds: string[]) {
  if (!employeeIds.length) return []
  const members = await prisma.projectMember.findMany({
    where: { projectId, isArchived: false, employeeId: { in: employeeIds } },
    include: { employee: { select: { id: true, fullName: true } } },
  })
  const byEmployeeId = new Map(members.map((member) => [member.employeeId, member]))
  return employeeIds.flatMap((employeeId) => {
    const member = byEmployeeId.get(employeeId)
    return member ? [member] : []
  })
}

async function validateDependencies(
  projectId: string,
  taskId: string | null,
  predecessorIds: string[],
) {
  if (predecessorIds.length === 0) return
  if (taskId && predecessorIds.includes(taskId)) {
    throw new TaskServiceError('INVALID_DEPENDENCY', 'Задача не может зависеть от самой себя')
  }
  const projectTasks = await prisma.task.findMany({
    where: { projectId },
    select: { id: true },
  })
  const taskIds = new Set(projectTasks.map((task) => task.id))
  if (predecessorIds.some((id) => !taskIds.has(id))) {
    throw new TaskServiceError('INVALID_DEPENDENCY', 'Предшествующая задача не найдена в проекте')
  }
  if (!taskId) return
  const dependencies = await prisma.taskDependency.findMany({
    where: { predecessor: { projectId } },
    select: { predecessorId: true, successorId: true },
  })
  ensureAcyclicDependencies(
    projectTasks.map((task) => task.id),
    [
      ...dependencies.filter((dependency) => dependency.successorId !== taskId),
      ...predecessorIds.map((predecessorId) => ({ predecessorId, successorId: taskId })),
    ],
  )
}

export class TaskService {
  static async list(projectId: string) {
    const tasks = await prisma.task.findMany({
      where: { projectId }, orderBy: { createdAt: 'asc' }, include: nestedTaskInclude,
    })
    return tasks.map(mapTask)
  }

  static async create(
    projectId: string,
    input: CreateTaskInput,
    actorId?: string,
    requestId?: string,
  ) {
    const parent = input.parentId
      ? await prisma.task.findUnique({ where: { id: input.parentId }, select: { projectId: true, level: true } })
      : null
    ensureValidTaskHierarchy({ projectId, level: input.level, parentId: input.parentId, parent })
    const members = await activeMembers(projectId, input.employeeIds)
    if (members.length !== input.employeeIds.length) {
      throw new TaskServiceError('INVALID_ASSIGNEES', 'Можно назначать только активных участников проекта')
    }
    await validateDependencies(projectId, null, input.predecessorIds)
    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          name: input.name,
          description: input.description || null,
          priority: input.priority,
          risk: input.risk,
          isMilestone: input.isMilestone,
          level: input.level,
          parentId: input.parentId || null,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          duration: input.isMilestone ? 0 : input.duration,
          progress: input.progress,
          responsible: members.length ? members.map((member) => member.employee.fullName).join('\n') : null,
          status: input.status,
          projectId,
          assignees: members.length
            ? { create: members.map((member) => ({ employeeId: member.employeeId, projectMemberId: member.id })) }
            : undefined,
          predecessors: input.predecessorIds.length
            ? { create: input.predecessorIds.map((predecessorId) => ({ predecessorId })) }
            : undefined,
          checklist: input.checklist.length
            ? { create: input.checklist.map((item, order) => ({ ...item, order })) }
            : undefined,
        },
        include: taskAssigneeInclude,
      })
      if (actorId) {
        await tx.auditLog.create({
          data: {
            userId: actorId,
            requestId,
            action: 'TASK_CREATE',
            entityType: 'Task',
            entityId: created.id,
            details: { projectId, priority: created.priority, risk: created.risk },
          },
        })
      }
      return created
    })
    return mapTask(task)
  }

  static async update(
    id: string,
    input: UpdateTaskInput,
    actorId?: string,
    requestId?: string,
  ) {
    const existing = await prisma.task.findUnique({ where: { id }, select: { id: true, projectId: true } })
    if (!existing) throw new TaskServiceError('TASK_NOT_FOUND', 'Задача не найдена')
    const members = input.employeeIds ? await activeMembers(existing.projectId, input.employeeIds) : null
    if (input.employeeIds && members?.length !== input.employeeIds.length) {
      throw new TaskServiceError('INVALID_ASSIGNEES', 'Можно назначать только активных участников проекта')
    }
    if (input.predecessorIds) {
      await validateDependencies(existing.projectId, id, input.predecessorIds)
    }
    const task = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          priority: input.priority,
          risk: input.risk,
          isMilestone: input.isMilestone,
          startDate: input.startDate !== undefined ? (input.startDate ? new Date(input.startDate) : null) : undefined,
          endDate: input.endDate !== undefined ? (input.endDate ? new Date(input.endDate) : null) : undefined,
          duration: input.isMilestone ? 0 : input.duration,
          progress: input.progress,
          status: input.status,
          responsible: input.employeeIds
            ? (members?.length ? members.map((member) => member.employee.fullName).join('\n') : null)
            : undefined,
          assignees: input.employeeIds ? {
            deleteMany: {},
            create: members?.map((member) => ({ employeeId: member.employeeId, projectMemberId: member.id })) || [],
          } : undefined,
          predecessors: input.predecessorIds ? {
            deleteMany: {},
            create: input.predecessorIds.map((predecessorId) => ({ predecessorId })),
          } : undefined,
          checklist: input.checklist ? {
            deleteMany: {},
            create: input.checklist.map((item, order) => ({ ...item, order })),
          } : undefined,
        },
        include: taskAssigneeInclude,
      })
      if (actorId) {
        await tx.auditLog.create({
          data: {
            userId: actorId,
            requestId,
            action: 'TASK_UPDATE',
            entityType: 'Task',
            entityId: id,
            details: { projectId: existing.projectId },
          },
        })
      }
      return updated
    })
    return mapTask(task)
  }

  static async addComment(
    id: string,
    authorId: string,
    body: string,
    requestId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id }, select: { id: true, projectId: true } })
      if (!task) throw new TaskServiceError('TASK_NOT_FOUND', 'Задача не найдена')
      const comment = await tx.taskComment.create({
        data: { taskId: id, authorId, body },
        include: { author: { select: { id: true, name: true } } },
      })
      await tx.auditLog.create({
        data: {
          userId: authorId,
          requestId,
          action: 'TASK_COMMENT',
          entityType: 'Task',
          entityId: id,
          details: { projectId: task.projectId },
        },
      })
      return comment
    })
  }

  static async delete(id: string, actorId?: string, requestId?: string) {
    try {
      await prisma.$transaction(async (tx) => {
        const task = await tx.task.findUnique({ where: { id }, select: { projectId: true } })
        if (!task) throw new TaskServiceError('TASK_NOT_FOUND', 'Задача не найдена')
        if (actorId) {
          await tx.auditLog.create({
            data: {
              userId: actorId,
              requestId,
              action: 'TASK_DELETE',
              entityType: 'Task',
              entityId: id,
              details: { projectId: task.projectId },
            },
          })
        }
        await tx.task.delete({ where: { id } })
      })
      return { success: true }
    } catch (error) {
      if (error instanceof TaskServiceError) throw error
      throw new TaskServiceError('TASK_NOT_FOUND', 'Задача не найдена')
    }
  }
}
