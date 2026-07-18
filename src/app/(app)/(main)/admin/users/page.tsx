import { UsersManager, type UserRow } from '@/features/users/ui/users-manager'
import { UserService } from '@/features/users/application/user.service'
import { requirePagePermission } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  await requirePagePermission('access.users.read')
  const [{ users }, references] = await Promise.all([
    UserService.list({ page: 1, pageSize: 100 }),
    UserService.references(),
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
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
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
