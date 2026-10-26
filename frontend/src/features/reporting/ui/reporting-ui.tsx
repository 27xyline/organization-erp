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
    <div className="bg-card min-w-0 p-5 transition-colors hover:bg-muted/30">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg border',
          tone === 'danger' ? 'border-red-200 bg-red-50/50 text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400' :
          tone === 'warning' ? 'border-amber-200 bg-amber-50/50 text-amber-600 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400' :
          'border-primary/10 bg-primary/5 text-primary'
        )}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="truncate text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

export function EmptyLine({ children = 'Нет данных за выбранный период' }: { children?: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}
