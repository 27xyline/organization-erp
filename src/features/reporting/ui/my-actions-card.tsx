import Link from 'next/link'
import { ArrowUpRight, CheckCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import type { MyActionsResult } from '../contracts/view-model'

export function MyActionsCard({ actions }: { actions: MyActionsResult }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <CheckCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle className="text-lg">Мои действия</CardTitle>
          <Badge variant="secondary">{actions.total}</Badge>
        </div>
        <Link href="/approvals?assignedToMe=true" className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          Согласования <ArrowUpRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent>
        {actions.items.length ? (
          <div className="divide-y">
            {actions.items.map((action) => (
              <Link key={action.id} href={action.href} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:text-primary">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-medium">{action.title}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{action.detail}</p>
                </div>
                <div className="shrink-0 text-right">
                  {action.urgency === 0 && <Badge variant="destructive">Просрочено</Badge>}
                  {action.dueAt && <p className="mt-1 text-xs text-muted-foreground">{formatDate(action.dueAt)}</p>}
                </div>
              </Link>
            ))}
          </div>
        ) : <p className="py-2 text-sm text-muted-foreground">Сейчас нет действий, требующих вашего внимания</p>}
        {actions.total > actions.items.length && (
          <p className="mt-3 text-xs text-muted-foreground">Показаны первые {actions.items.length} из {actions.total}</p>
        )}
      </CardContent>
    </Card>
  )
}
