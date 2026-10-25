import { Skeleton } from '@/components/ui/skeleton'

export default function DocumentsLoading() {
  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-80 w-full" />
    </main>
  )
}

