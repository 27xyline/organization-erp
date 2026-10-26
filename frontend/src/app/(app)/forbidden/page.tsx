import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { defaultLandingPath, requirePageUser } from '@/lib/auth/authorization'

export default async function ForbiddenPage() {
  const user = await requirePageUser()
  const landingPath = defaultLandingPath(user)

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Недостаточно прав</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            У вашей учётной записи нет доступа к этому разделу или выбранной записи.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href={landingPath}>Перейти в доступный раздел</Link></Button>
            {landingPath !== '/account/password' ? (
              <Button asChild variant="outline">
                <Link href="/account/password">Изменить пароль</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
