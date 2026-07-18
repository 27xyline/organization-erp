import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ProgressBar({
  value,
  tone = 'default',
}: {
  value: number
  tone?: 'default' | 'danger' | 'success'
}) {
  const safeValue = Math.max(0, Math.min(100, value))
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`${safeValue}%`}>
      <div
        className={cn(
          'h-full rounded-full',
          tone === 'danger' ? 'bg-red-500' : tone === 'success' ? 'bg-emerald-500' : 'bg-blue-600',
        )}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  )
}

export function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string
  detail: string
  icon: LucideIcon
  tone?: 'default' | 'warning' | 'danger'
}) {
  return (
    <div className="min-w-0 border-b p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={cn(
          'h-4 w-4',
          tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : 'text-blue-600',
        )} />
      </div>
      <p className="truncate text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

export function EmptyLine({ children = 'Нет данных за выбранный период' }: { children?: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}
