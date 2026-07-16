import { prisma } from '@/lib/prisma'
import type { CreateTaskInput, UpdateTaskInput } from '../contracts/task'
import { ensureValidTaskHierarchy, TaskServiceError } from '../domain/task-rules'

export { TaskServiceError } from '../domain/task-rules'

const taskAssigneeInclude = {
  assignees: {
    include: {
      employee: { select: { id: true, fullName: true } },
      projectMember: { select: { id: true } },
    },
  },
} as const

const nestedTaskInclude = {
  ...taskAssigneeInclude,
  children: { include: { ...taskAssigneeInclude, children: { include: taskAssigneeInclude } } },
} as const

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

export class TaskService {
  static async list(projectId: string) {
    const tasks = await prisma.task.findMany({
      where: { projectId }, orderBy: { createdAt: 'asc' }, include: nestedTaskInclude,
    })
    return tasks.map(mapTask)
  }

  static async create(projectId: string, input: CreateTaskInput) {
    const parent = input.parentId
      ? await prisma.task.findUnique({ where: { id: input.parentId }, select: { projectId: true, level: true } })
      : null
    ensureValidTaskHierarchy({ projectId, level: input.level, parentId: input.parentId, parent })
    const members = await activeMembers(projectId, input.employeeIds)
    if (members.length !== input.employeeIds.length) {
      throw new TaskServiceError('INVALID_ASSIGNEES', 'Можно назначать только активных участников проекта')
    }
    const task = await prisma.task.create({
      data: {
        name: input.name, level: input.level, parentId: input.parentId || null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        duration: input.duration, progress: input.progress,
        responsible: members.length ? members.map((member) => member.employee.fullName).join('\n') : null,
        status: input.status, projectId,
        assignees: members.length ? { create: members.map((member) => ({ employeeId: member.employeeId, projectMemberId: member.id })) } : undefined,
      },
      include: taskAssigneeInclude,
    })
    return mapTask(task)
  }

  static async update(id: string, input: UpdateTaskInput) {
    const existing = await prisma.task.findUnique({ where: { id }, select: { id: true, projectId: true } })
    if (!existing) throw new TaskServiceError('TASK_NOT_FOUND', 'Задача не найдена')
    const members = input.employeeIds ? await activeMembers(existing.projectId, input.employeeIds) : null
    if (input.employeeIds && members?.length !== input.employeeIds.length) {
      throw new TaskServiceError('INVALID_ASSIGNEES', 'Можно назначать только активных участников проекта')
    }
    const task = await prisma.task.update({
      where: { id },
      data: {
        name: input.name,
        startDate: input.startDate !== undefined ? (input.startDate ? new Date(input.startDate) : null) : undefined,
        endDate: input.endDate !== undefined ? (input.endDate ? new Date(input.endDate) : null) : undefined,
        duration: input.duration, progress: input.progress, status: input.status,
        responsible: input.employeeIds ? (members?.length ? members.map((member) => member.employee.fullName).join('\n') : null) : undefined,
        assignees: input.employeeIds ? {
          deleteMany: {},
          create: members?.map((member) => ({ employeeId: member.employeeId, projectMemberId: member.id })) || [],
        } : undefined,
      },
      include: taskAssigneeInclude,
    })
    return mapTask(task)
  }

  static async delete(id: string) {
    try {
      await prisma.task.delete({ where: { id } })
      return { success: true }
    } catch {
      throw new TaskServiceError('TASK_NOT_FOUND', 'Задача не найдена')
    }
  }
}
