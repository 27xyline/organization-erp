import { AppLayout } from '@/components/app-layout'
import { requirePageUser } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser()
  return <AppLayout>{children}</AppLayout>
}
