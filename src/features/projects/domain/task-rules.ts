import { ServiceError } from '@/lib/errors/service-error'

type TaskErrorCode =
  | 'TASK_NOT_FOUND'
  | 'INVALID_HIERARCHY'
  | 'INVALID_ASSIGNEES'
  | 'INVALID_DEPENDENCY'

export class TaskServiceError extends ServiceError<TaskErrorCode> {
  constructor(code: TaskErrorCode, message: string) {
    super(code, message)
  }
}

export function ensureAcyclicDependencies(
  taskIds: readonly string[],
  edges: readonly { predecessorId: string; successorId: string }[],
) {
  const adjacency = new Map(taskIds.map((id) => [id, [] as string[]]))
  edges.forEach((edge) => adjacency.get(edge.predecessorId)?.push(edge.successorId))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false
    if (visited.has(id)) return true
    visiting.add(id)
    for (const next of adjacency.get(id) || []) {
      if (!visit(next)) return false
    }
    visiting.delete(id)
    visited.add(id)
    return true
  }

  if (!taskIds.every(visit)) {
    throw new TaskServiceError('INVALID_DEPENDENCY', 'Зависимости задач образуют цикл')
  }
}

export function ensureValidTaskHierarchy(input: {
  projectId: string
  level: number
  parentId?: string | null
  parent: { projectId: string; level: number } | null
}) {
  if (!input.parentId && input.level !== 1) {
    throw new TaskServiceError('INVALID_HIERARCHY', 'Корневая задача должна иметь уровень 1')
  }
  if (!input.parentId) return
  if (!input.parent) {
    throw new TaskServiceError('INVALID_HIERARCHY', 'Родительская задача не найдена')
  }
  if (input.parent.projectId !== input.projectId) {
    throw new TaskServiceError('INVALID_HIERARCHY', 'Родительская задача должна принадлежать этому проекту')
  }
  if (input.parent.level >= 3) {
    throw new TaskServiceError('INVALID_HIERARCHY', 'Нельзя создать подзадачу глубже третьего уровня')
  }
  if (input.level !== input.parent.level + 1) {
    throw new TaskServiceError('INVALID_HIERARCHY', 'Уровень подзадачи должен быть на один больше уровня родительской задачи')
  }
}
