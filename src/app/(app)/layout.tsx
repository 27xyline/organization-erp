import { AppLayout } from '@/components/app-layout'
import { requirePageUser } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser()
  return (
    <AppLayout currentUser={{
      name: user.name,
      roles: user.roles,
      permissions: user.permissions,
    }}>
      {children}
    </AppLayout>
  )
}
