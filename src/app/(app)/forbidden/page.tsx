import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForbiddenPage() {
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
          <Button asChild><Link href="/account/password">Перейти в профиль</Link></Button>
        </CardContent>
      </Card>
    </main>
  )
}
