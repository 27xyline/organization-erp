import { ServiceError } from '@/lib/errors/service-error'

type TaskErrorCode = 'TASK_NOT_FOUND' | 'INVALID_HIERARCHY' | 'INVALID_ASSIGNEES'

export class TaskServiceError extends ServiceError<TaskErrorCode> {
  constructor(code: TaskErrorCode, public readonly message: string) {
    super(code)
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
