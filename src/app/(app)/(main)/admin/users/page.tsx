import { UsersManager, type UserRow } from '@/features/users/ui/users-manager'
import { UserService } from '@/features/users/application/user.service'
import { requirePageUser } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  await requirePageUser(['ADMIN'])
  const { users } = await UserService.list({ page: 1, pageSize: 100 })
  const initialUsers: UserRow[] = users.map((user) => ({
    ...user,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  }))

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold">Пользователи</h1>
        <p className="mt-1 text-muted-foreground">Управление доступом и ролями сотрудников.</p>
      </div>
      <UsersManager initialUsers={initialUsers} />
    </main>
  )
}
