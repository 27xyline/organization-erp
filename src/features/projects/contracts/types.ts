import { ProjectStatus, TaskPriority, TaskRisk, TaskStatus } from '@prisma/client'
import type { Asset } from '@/features/assets/contracts/types'

export { ProjectStatus, TaskPriority, TaskRisk, TaskStatus }

export interface Project {
  id: string
  code: string
  name: string
  description?: string
  goals?: string
  tasks?: string
  results?: string
  startDate?: Date
  endDate?: Date
  status: ProjectStatus
  plannedBudget: number
  actualBudget: number
  assets?: Asset[]
  tasksList?: Task[]
  createdAt: Date
  updatedAt: Date
}

export interface Task {
  id: string
  name: string
  description?: string | null
  priority?: TaskPriority
  risk?: TaskRisk
  isMilestone?: boolean
  level: number
  parentId?: string | null
  parent?: Task | null
  children?: Task[]
  startDate?: Date | null
  endDate?: Date | null
  duration?: number | null
  progress: number
  responsible?: string | null
  assignees: TaskAssignee[]
  predecessors?: Array<{
    id: string
    predecessorId: string
    lagDays: number
    predecessor: { id: string; name: string }
  }>
  checklist?: Array<{ id: string; title: string; completed: boolean; order: number }>
  comments?: Array<{
    id: string
    body: string
    createdAt: Date
    author: { id: string; name: string }
  }>
  status: TaskStatus
  projectId: string
  project?: Project
  createdAt: Date
  updatedAt: Date
}

export interface TaskAssignee {
  employeeId: string
  fullName: string
  projectMemberId?: string | null
}

export const ProjectStatusLabels: Record<ProjectStatus, string> = {
  [ProjectStatus.ACTIVE]: 'Активный',
  [ProjectStatus.COMPLETED]: 'Завершен',
  [ProjectStatus.ARCHIVED]: 'Архив',
}

export const TaskStatusLabels: Record<TaskStatus, string> = {
  [TaskStatus.NOT_STARTED]: 'Не начата',
  [TaskStatus.IN_PROGRESS]: 'В работе',
  [TaskStatus.COMPLETED]: 'Завершена',
  [TaskStatus.DELAYED]: 'Просрочена',
}

export const TaskPriorityLabels: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: 'Низкий',
  [TaskPriority.MEDIUM]: 'Средний',
  [TaskPriority.HIGH]: 'Высокий',
  [TaskPriority.CRITICAL]: 'Критический',
}

export const TaskRiskLabels: Record<TaskRisk, string> = {
  [TaskRisk.LOW]: 'Низкий',
  [TaskRisk.MEDIUM]: 'Средний',
  [TaskRisk.HIGH]: 'Высокий',
}
