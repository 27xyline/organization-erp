'use client'

import { Button } from '@/components/ui/button'

export default function DocumentsError({ reset }: { reset: () => void }) {
  return (
    <main className="container mx-auto px-4 py-12">
      <div className="rounded-lg border p-8 text-center">
        <h2 className="text-xl font-semibold">Не удалось загрузить документы</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Проверьте подключение к базе и доступность локального хранилища.
        </p>
        <Button className="mt-4" onClick={reset}>Повторить</Button>
      </div>
    </main>
  )
}
