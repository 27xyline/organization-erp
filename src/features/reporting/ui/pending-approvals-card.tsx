import Link from 'next/link'
import { ArrowUpRight, CheckCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import type { PendingApprovalItem } from '@/features/approvals/contracts/approval'

export function PendingApprovalsCard({
  requests,
  total,
}: {
  requests: PendingApprovalItem[]
  total: number
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <CheckCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle className="text-lg">Требует моего решения</CardTitle>
          {total > 0 && <Badge variant="secondary">{total}</Badge>}
        </div>
        <Link
          href="/approvals"
          className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          Все <ArrowUpRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent>
        {requests.length ? (
          <div className="divide-y">
            {requests.map((request) => {
              const overdue = request.dueAt !== null && request.dueAt < new Date()
              return (
                <Link
                  key={request.id}
                  href="/approvals"
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:text-primary"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium">{request.title}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Этап {request.step.sequence}: {request.step.name} · {request.requestedBy.name}
                    </p>
                  </div>
                  {request.dueAt ? (
                    <time
                      dateTime={request.dueAt.toISOString()}
                      className={`shrink-0 text-right text-xs ${overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
                    >
                      {formatDate(request.dueAt)}
                    </time>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">Без срока</span>
                  )}
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">Новых решений сейчас нет</p>
        )}
      </CardContent>
    </Card>
  )
}
