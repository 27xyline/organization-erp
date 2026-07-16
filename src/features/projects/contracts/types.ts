import { ProjectStatus, TaskStatus } from '@prisma/client'
import type { Asset } from '@/features/assets/contracts/types'

export { ProjectStatus, TaskStatus }

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
