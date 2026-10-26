import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PasswordForm } from '@/features/users/ui/password-form'
import { requirePageUser } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function PasswordPage() {
  await requirePageUser()
  return (
    <main className="container mx-auto max-w-xl px-4 py-8">
      <Card>
        <CardHeader><CardTitle>Изменение пароля</CardTitle></CardHeader>
        <CardContent><PasswordForm /></CardContent>
      </Card>
    </main>
  )
}
