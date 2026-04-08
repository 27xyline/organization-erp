import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <h2 className="text-4xl font-bold text-muted-foreground">404</h2>
      <p className="mt-2 text-lg text-muted-foreground">Страница не найдена</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Вернуться на главную
      </Link>
    </div>
  )
}
