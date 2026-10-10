import { UsersManager, type AccessReferences, type UserRow } from '@/features/users/ui/users-manager'
import { requirePagePermission } from '@/lib/auth/authorization'
import { backendUserFetch } from '@/lib/backend/bridge'
import { BackendRequestError } from '@/lib/backend/client'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const user = await requirePagePermission('access.users.read')
  let listResponse: Response
  let referencesResponse: Response
  try {
    const responses = await Promise.all([
      backendUserFetch('/api/users?page=1&pageSize=100', user),
      backendUserFetch('/api/users/references', user),
    ])
    ;[listResponse, referencesResponse] = responses
  } catch (error) {
    throw new Error('Не удалось загрузить пользователей из backend', { cause: error })
  }
  if (!listResponse.ok || !referencesResponse.ok) {
    throw new BackendRequestError('Не удалось загрузить пользователей из backend', 502)
  }
  const [{ data: users }, { data: references }] = await Promise.all([
    listResponse.json() as Promise<{ data: Array<{
      id: string
      username: string
      name: string
      employeeId: string | null
      roleAssignments: Array<{
        role: UserRow['assignments'][number]['role']
        departmentScopeMode: UserRow['assignments'][number]['departmentScopeMode']
        projectScopeMode: UserRow['assignments'][number]['projectScopeMode']
        departmentScopes: Array<{ departmentId: string }>
        projectScopes: Array<{ projectId: string }>
      }>
      isActive: boolean
      mustChangePassword: boolean
      lockedUntil: string | null
      lastLoginAt: string | null
    }> }>,
    referencesResponse.json() as Promise<{ data: AccessReferences }>,
  ])
  const initialUsers: UserRow[] = users.map((user) => ({
    id: user.id,
    username: user.username,
    name: user.name,
    employeeId: user.employeeId,
    assignments: user.roleAssignments.map((assignment) => ({
      role: assignment.role,
      departmentScopeMode: assignment.departmentScopeMode,
      projectScopeMode: assignment.projectScopeMode,
      departmentIds: assignment.departmentScopes.map((scope) => scope.departmentId),
      projectIds: assignment.projectScopes.map((scope) => scope.projectId),
    })),
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt,
  }))

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold">Пользователи</h1>
        <p className="mt-1 text-muted-foreground">Управление доступом и ролями сотрудников.</p>
      </div>
      <UsersManager initialUsers={initialUsers} references={references} />
    </main>
  )
}
