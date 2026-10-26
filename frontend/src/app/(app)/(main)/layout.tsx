import { redirect } from 'next/navigation'
import { requirePageUser } from '@/lib/auth/authorization'

export default async function MainApplicationLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser()
  if (user.mustChangePassword) redirect('/account/password')
  return children
}
