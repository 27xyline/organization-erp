import { requirePagePermission } from '@/lib/auth/authorization'
import { backendUserFetch } from '@/lib/backend/transport'
import { readBackendData } from '@/lib/backend/page-data'
import { SharedTasksBoard, type InboxTask, type Reference } from '@/features/tasks/ui/shared-tasks-board'

export const dynamic = 'force-dynamic'
export default async function TasksPage() {
  const user = await requirePagePermission('tasks.read')
  const canManage = user.roles.some((role) => role === 'ADMIN' || role === 'PROJECT_MANAGER')
  const [taskResponse, assigneeResponse, projectResponse] = await Promise.all([
    backendUserFetch('/api/tasks', user),
    canManage ? backendUserFetch('/api/tasks/assignees', user) : Promise.resolve(null),
    canManage && user.access.has('projects.read') ? backendUserFetch('/api/projects?page=1&pageSize=100', user) : Promise.resolve(null),
  ])
  const tasks = await readBackendData<InboxTask[]>(taskResponse, 'Не удалось загрузить задачи')
  const assignees = assigneeResponse ? await readBackendData<Reference[]>(assigneeResponse, 'Не удалось загрузить сотрудников') : []
  const projects: Array<{ id: string; name: string }> = []
  if (projectResponse) {
    const metadata = await projectResponse.clone().json() as { pagination?: { totalPages?: number } }
    projects.push(...await readBackendData<Array<{ id: string; name: string }>>(projectResponse, 'Не удалось загрузить проекты'))
    const pages = await Promise.all(Array.from({ length: Math.max(0, (metadata.pagination?.totalPages || 1) - 1) }, (_, index) => backendUserFetch(`/api/projects?page=${index + 2}&pageSize=100`, user)))
    for (const response of pages) projects.push(...await readBackendData<Array<{ id: string; name: string }>>(response, 'Не удалось загрузить проекты'))
  }
  return <SharedTasksBoard tasks={tasks.map((task) => ({ ...task, canManageProject: !!task.projectId && user.access.allows('tasks.update', { projectId: task.projectId }) }))} canManage={canManage} projects={projects.filter((project) => user.access.allows('tasks.create', { projectId: project.id }))} assignees={assignees} employeeId={user.employeeId} />
}
