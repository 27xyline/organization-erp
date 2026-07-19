'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Archive,
  ArrowRightLeft,
  Briefcase,
  Edit,
  RefreshCw,
  Trash2,
  User,
  UserPlus,
  UserX,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatDateTime } from '@/lib/utils'
import { personnelActionLabels, type PersonnelAction, type PersonnelActionType } from '@/features/employees/contracts/types'

const getPersonnelActionIcon = (type: PersonnelActionType) => {
  switch (type) {
    case 'HIRE':
      return <UserPlus className="h-4 w-4 text-emerald-600" />
    case 'DISMISS':
      return <UserX className="h-4 w-4 text-rose-600" />
    case 'TRANSFER':
      return <ArrowRightLeft className="h-4 w-4 text-blue-600" />
    case 'EXTEND':
      return <RefreshCw className="h-4 w-4 text-amber-600" />
    case 'PROMOTE':
      return <Briefcase className="h-4 w-4 text-violet-600" />
    case 'ARCHIVE':
      return <Archive className="h-4 w-4 text-slate-600" />
    case 'EDIT':
      return <Edit className="h-4 w-4 text-sky-600" />
    default:
      return <User className="h-4 w-4" />
  }
}

const getPersonnelActionDescription = (action: PersonnelAction) => {
  if (action.description) return action.description

  switch (action.type) {
    case 'HIRE':
      if (action.newContractEndDate) {
        return `Прием по договору до ${formatDate(action.newContractEndDate)}`
      }
      return action.newDepartment ? `Прием в подразделение ${action.newDepartment}` : 'Прием на работу'
    case 'DISMISS':
      return 'Увольнение сотрудника'
    case 'TRANSFER':
      if (action.oldDepartment && action.newDepartment && action.oldDepartment !== action.newDepartment) {
        return `${action.oldDepartment} -> ${action.newDepartment}`
      }
      if (action.oldPosition && action.newPosition && action.oldPosition !== action.newPosition) {
        return `${action.oldPosition} -> ${action.newPosition}`
      }
      return 'Кадровый перевод'
    case 'EXTEND':
      if (action.newContractEndDate) {
        return `Продление договора до ${formatDate(action.newContractEndDate)}`
      }
      return 'Продление срока действия договора'
    case 'PROMOTE':
      return 'Повышение сотрудника'
    case 'ARCHIVE':
      return 'Закончился срок действия трудового договора'
    case 'EDIT':
      return 'Изменены данные сотрудника'
    default:
      return personnelActionLabels[action.type]
  }
}

interface PersonnelTimelineProps {
  loading: boolean
  personnelActions: PersonnelAction[]
  onDeleteAction: (id: string) => void
}

export function PersonnelTimeline({ loading, personnelActions, onDeleteAction }: PersonnelTimelineProps) {
  const thirtyDaysAgo = useMemo(() => Date.now() - 30 * 24 * 60 * 60 * 1000, [personnelActions])
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden xl:col-span-1">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <RefreshCw className="h-5 w-5" />
            Кадровые действия
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Всего действий</p>
            <p className="mt-2 font-medium">{personnelActions.length}</p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">За 30 дней</p>
            <p className="mt-2 font-medium">
              {personnelActions.filter((action) => action.createdAt.getTime() >= thirtyDaysAgo).length}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="group rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="mt-0.5 h-8 w-8 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2 w-full">
                        <Skeleton className="h-5 w-[200px]" />
                        <Skeleton className="h-4 w-[300px]" />
                      </div>
                      <Skeleton className="h-6 w-[100px]" />
                    </div>
                    <Skeleton className="h-3 w-[250px]" />
                  </div>
                </div>
              </div>
            ))
          ) : personnelActions.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              Журнал кадровых действий пока пуст.
            </div>
          ) : (
            personnelActions.map((action) => (
              <div key={action.id} className="group rounded-xl border p-4 transition-colors hover:bg-slate-50/70">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-slate-100 p-2">
                    {getPersonnelActionIcon(action.type)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{action.employee?.fullName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{getPersonnelActionDescription(action)}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{personnelActionLabels[action.type]}</Badge>
                        {action.type !== 'ARCHIVE' && !action.isSynthetic && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => onDeleteAction(action.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>Создано: {formatDateTime(action.createdAt)}</span>
                        {action.createdAt.getTime() !== action.date.getTime() && (
                          <span>Дата события: {formatDate(action.date)}</span>
                        )}
                        {(action.oldDepartment || action.newDepartment) && (
                          <span>
                            {action.oldDepartment || '—'} {'->'} {action.newDepartment || '—'}
                          </span>
                        )}
                      </div>
                      {(action.oldPosition || action.newPosition) && (
                        <span>
                          {action.oldPosition || '—'} {'->'} {action.newPosition || '—'}
                        </span>
                      )}
                      {(action.oldContractEndDate || action.newContractEndDate) && (
                        <span>
                          Договор: {action.oldContractEndDate ? formatDate(action.oldContractEndDate) : '—'} {'->'} {action.newContractEndDate ? formatDate(action.newContractEndDate) : '—'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
