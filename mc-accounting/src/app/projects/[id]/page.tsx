import { notFound } from 'next/navigation'
import Link from 'next/link'
import { FinancePlanType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, ArrowRightLeft, Calendar, CheckSquare, Edit, FolderKanban, Target, Trophy, Wallet } from 'lucide-react'
import { ProjectStatusLabels } from '@/types'
import { formatDate, formatCurrency, formatDateTime } from '@/lib/utils'
import { ProjectGantt } from './gantt-client'

interface ProjectPageProps {
  params: { id: string }
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      tasksList: {
        orderBy: { createdAt: 'asc' },
      },
      assets: {
        include: {
          mol: true,
          group: true,
          operations: {
            where: {
              type: {
                in: ['RECEIPT', 'DISPOSAL'],
              },
            },
            orderBy: {
              date: 'desc',
            },
          },
        },
      },
      financePlanEntries: {
        include: {
          employee: {
            select: {
              id: true,
              fullName: true,
              department: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      _count: {
        select: { assets: true, tasksList: true, financePlanEntries: true }
      }
    }
  })

  if (!project) {
    notFound()
  }

  // Calculate budget remaining
  const remainingBudget = Number(project.plannedBudget) - Number(project.actualBudget)
  const projectDurationDays = project.startDate && project.endDate
    ? Math.ceil((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const planningPeriods = (() => {
    const formatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    const start = project.startDate ? new Date(project.startDate) : new Date()
    const end = project.endDate ? new Date(project.endDate) : new Date(start.getFullYear(), start.getMonth() + 2, 1)
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1)
    const result: string[] = []

    while (cursor <= lastMonth && result.length < 3) {
      const label = formatter.format(cursor)
      result.push(`${label.charAt(0).toUpperCase()}${label.slice(1)}`)
      cursor.setMonth(cursor.getMonth() + 1)
    }

    while (result.length < 3) {
      const label = formatter.format(cursor)
      result.push(`${label.charAt(0).toUpperCase()}${label.slice(1)}`)
      cursor.setMonth(cursor.getMonth() + 1)
    }

    return result
  })()

  const payrollRows = [
    'Основная команда',
    'Дополнительные выплаты',
    'Резерв проекта',
  ]

  const projectJournalEntries = project.assets
    .flatMap((asset) =>
      asset.operations.map((operation) => ({
        id: operation.id,
        type: operation.type,
        assetName: asset.name,
        inventoryNumber: asset.inventoryNumber,
        date: operation.date,
        totalCost: Number(operation.totalCost),
        quantity: Number(operation.quantity),
        documentType: operation.documentType,
        documentDetails: operation.documentDetails,
      }))
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const receiptTotal = projectJournalEntries
    .filter((entry) => entry.type === 'RECEIPT')
    .reduce((sum, entry) => sum + entry.totalCost, 0)

  const disposalTotal = projectJournalEntries
    .filter((entry) => entry.type === 'DISPOSAL')
    .reduce((sum, entry) => sum + entry.totalCost, 0)

  const financeTypeLabels: Record<FinancePlanType, string> = {
    OKLAD: 'Оклад',
    NADBAVKA: 'Надбавка',
  }

  const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })

  const projectFinanceEntries = project.financePlanEntries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    employeeId: entry.employee.id,
    employeeName: entry.employee.fullName,
    employeeDepartment: entry.employee.department,
    monthLabel: `${monthFormatter.format(new Date(entry.year, entry.month - 1, 1)).charAt(0).toUpperCase()}${monthFormatter.format(new Date(entry.year, entry.month - 1, 1)).slice(1)}`,
    amount: Number(entry.amount),
    createdAt: entry.createdAt,
  }))

  const projectFinanceGroups = Array.from(
    projectFinanceEntries.reduce((groups, entry) => {
      const currentGroup = groups.get(entry.employeeId)

      if (currentGroup) {
        currentGroup.total += entry.amount
        currentGroup.entries.push(entry)
        if (entry.createdAt > currentGroup.latestCreatedAt) {
          currentGroup.latestCreatedAt = entry.createdAt
        }
      } else {
        groups.set(entry.employeeId, {
          employeeId: entry.employeeId,
          employeeName: entry.employeeName,
          employeeDepartment: entry.employeeDepartment,
          total: entry.amount,
          latestCreatedAt: entry.createdAt,
          entries: [entry],
        })
      }

      return groups
    }, new Map<string, {
      employeeId: string
      employeeName: string
      employeeDepartment: string
      total: number
      latestCreatedAt: Date
      entries: typeof projectFinanceEntries
    }>())
  ).map(([, group]) => ({
    ...group,
    entries: group.entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  })).sort((a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime())

  const financeTotal = projectFinanceEntries.reduce((sum, entry) => sum + entry.amount, 0)
  const okladTotal = projectFinanceEntries
    .filter((entry) => entry.type === FinancePlanType.OKLAD)
    .reduce((sum, entry) => sum + entry.amount, 0)
  const nadbavkaTotal = projectFinanceEntries
    .filter((entry) => entry.type === FinancePlanType.NADBAVKA)
    .reduce((sum, entry) => sum + entry.amount, 0)

  return (
    <main className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <Link href="/projects">
          <Button variant="ghost" className="pl-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к списку
          </Button>
        </Link>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <Badge 
              variant={project.status === 'ACTIVE' ? 'default' : 'secondary'}
            >
              {ProjectStatusLabels[project.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground">{project.code}</p>
        </div>
        <Link href={`/projects/${project.id}/edit`}>
          <Button variant="outline">
            <Edit className="mr-2 h-4 w-4" />
            Редактировать
          </Button>
        </Link>
      </div>

      {/* Main layout: Gantt left, Info right */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left side - Gantt Chart with task table */}
        <div className="xl:col-span-3 min-h-[700px]">
          <ProjectGantt 
            projectId={project.id}
            tasks={(project.tasksList || []) as any}
          />
        </div>

        {/* Right side - Project info */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Детали проекта</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium flex items-center gap-2">
                  <FolderKanban className="h-4 w-4" />
                  Описание проекта
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.description || 'Нет описания'}</p>
              </div>

              <div className="space-y-1 border-t pt-4">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Цели проекта
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.goals || 'Нет целей'}</p>
              </div>

              <div className="space-y-1 border-t pt-4">
                <p className="text-sm font-medium flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" />
                  Задачи проекта
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.tasks || 'Нет задач'}</p>
              </div>

              <div className="space-y-1 border-t pt-4">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  Результаты проекта
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.results || 'Нет результатов'}</p>
              </div>
            </CardContent>
          </Card>

          {/* Budget Block */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Бюджет проекта
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Структура цены:</span>
                <span className="text-sm font-medium">{project._count.assets} активов</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Плановый бюджет:</span>
                <span className="text-sm font-medium">{formatCurrency(Number(project.plannedBudget))}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Фактический бюджет:</span>
                <span className="text-sm font-medium">{formatCurrency(Number(project.actualBudget))}</span>
              </div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">Остатки бюджета:</span>
                <span className={`text-sm font-medium ${remainingBudget < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(remainingBudget)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Timeline Block */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Сроки проекта
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Дата начала:</span>
                <span className="text-sm font-medium">
                  {project.startDate ? formatDate(project.startDate) : '—'}
                </span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Дата окончания:</span>
                <span className="text-sm font-medium">
                  {project.endDate ? formatDate(project.endDate) : '—'}
                </span>
              </div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">Продолжительность:</span>
                <span className="text-sm font-medium">
                  {projectDurationDays !== null ? `${projectDurationDays} дней` : '—'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader className="border-b bg-slate-50/80">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" />
              Таблица с планированием выплат заработной платы
            </CardTitle>
            <CardDescription>
              Раздел подготовлен под будущую детализацию выплат по периодам проекта.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Период проекта</p>
                <p className="mt-2 text-sm font-medium">
                  {project.startDate && project.endDate
                    ? `${formatDate(project.startDate)} - ${formatDate(project.endDate)}`
                    : 'Сроки пока не заданы'}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Задач в плане</p>
                <p className="mt-2 text-sm font-medium">{project._count.tasksList} позиций</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Плановый бюджет</p>
                <p className="mt-2 text-sm font-medium">{formatCurrency(Number(project.plannedBudget))}</p>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto rounded-xl border">
              <div className="grid min-w-[720px] grid-cols-[minmax(220px,1.3fr)_repeat(3,minmax(140px,1fr))] border-b bg-muted/40 text-sm font-medium text-muted-foreground">
                <div className="border-r px-4 py-3">Статья</div>
                {planningPeriods.map((period) => (
                  <div key={period} className="border-r px-4 py-3 last:border-r-0">
                    {period}
                  </div>
                ))}
              </div>

              <div className="min-w-[720px] divide-y">
                {payrollRows.map((row) => (
                  <div key={row} className="grid grid-cols-[minmax(220px,1.3fr)_repeat(3,minmax(140px,1fr))] text-sm">
                    <div className="border-r px-4 py-4 font-medium text-slate-700">{row}</div>
                    {planningPeriods.map((period) => (
                      <div key={`${row}-${period}`} className="border-r px-4 py-4 text-muted-foreground last:border-r-0">
                        —
                      </div>
                    ))}
                  </div>
                ))}

                <div className="grid grid-cols-[minmax(220px,1.3fr)_repeat(3,minmax(140px,1fr))] bg-slate-50/70 text-sm font-medium">
                  <div className="border-r px-4 py-4">Итого</div>
                  {planningPeriods.map((period) => (
                    <div key={`total-${period}`} className="border-r px-4 py-4 text-muted-foreground last:border-r-0">
                      —
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-dashed bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground">
              Таблица уже встроена в страницу и готова к заполнению, когда появятся данные по выплатам.
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-slate-50/80">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowRightLeft className="h-4 w-4" />
              Журнал поступлений и списаний
            </CardTitle>
            <CardDescription>
              Последние операции по активам, привязанным к этому проекту.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Поступления</p>
                <p className="mt-2 text-sm font-medium">{formatCurrency(receiptTotal)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Списания</p>
                <p className="mt-2 text-sm font-medium">{formatCurrency(disposalTotal)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Записей</p>
                <p className="mt-2 text-sm font-medium">{projectJournalEntries.length}</p>
              </div>
            </div>

            {projectJournalEntries.length > 0 ? (
              <div className="mt-6 space-y-3">
                {projectJournalEntries.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="rounded-xl border p-4 transition-colors hover:bg-slate-50/70">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={entry.type === 'RECEIPT' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}>
                            {entry.type === 'RECEIPT' ? 'Приход' : 'Списание'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                        </div>
                        <p className="mt-3 text-sm font-medium text-slate-900">{entry.assetName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Инв. номер: {entry.inventoryNumber}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{formatCurrency(entry.totalCost)}</p>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <p>Количество: {entry.quantity}</p>
                      <p>{entry.documentType}: {entry.documentDetails}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-6 flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-slate-50/70 p-6 text-center">
                <div>
                  <p className="text-sm font-medium text-slate-900">Пока нет операций по поступлениям и списаниям</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Как только по активам проекта появятся движения, они будут отображаться в этом журнале.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8 overflow-hidden">
        <CardHeader className="border-b bg-slate-50/80">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            Финансовые действия проекта
          </CardTitle>
          <CardDescription>
            Начисления по сотрудникам из разделов `Оклад` и `Надбавка`, связанные с этим проектом.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Всего действий</p>
              <p className="mt-2 text-sm font-medium">{project._count.financePlanEntries}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Оклад</p>
              <p className="mt-2 text-sm font-medium">{formatCurrency(okladTotal)}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Надбавка</p>
              <p className="mt-2 text-sm font-medium">{formatCurrency(nadbavkaTotal)}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Итого</p>
              <p className="mt-2 text-sm font-medium">{formatCurrency(financeTotal)}</p>
            </div>
          </div>

          {projectFinanceGroups.length > 0 ? (
            <div className="mt-6 space-y-3">
              {projectFinanceGroups.map((group) => (
                <div key={group.employeeId} className="rounded-xl border p-4 transition-colors hover:bg-slate-50/70">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{group.employeeName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{group.employeeDepartment}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(group.total)}</p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {group.entries.map((entry) => (
                      <div key={entry.id} className="rounded-lg border bg-white px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={entry.type === FinancePlanType.OKLAD ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-violet-200 bg-violet-50 text-violet-700'}>
                                {financeTypeLabels[entry.type]}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{entry.monthLabel}</span>
                            </div>
                            <div className="mt-3 text-xs text-muted-foreground">
                              Создано: {formatDateTime(entry.createdAt)}
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">{formatCurrency(entry.amount)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 flex min-h-[220px] items-center justify-center rounded-xl border border-dashed bg-slate-50/70 p-6 text-center">
              <div>
                <p className="text-sm font-medium text-slate-900">Пока нет финансовых действий по этому проекту</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Как только в разделах `Оклад` или `Надбавка` появятся начисления с привязкой к проекту, они будут отображаться здесь.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
