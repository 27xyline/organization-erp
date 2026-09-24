import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  FileSpreadsheet,
  Package,
  ReceiptRussianRuble,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import type { DashboardOverview } from '../contracts/view-model'
import type { PendingApprovalsResult } from '@/features/approvals/contracts/approval'
import {
  ACTIVITY_LABELS,
  ASSET_STATUS_LABELS,
  VACATION_TYPE_LABELS,
} from '../contracts/labels'
import { ReportFilters } from './report-filters'
import {
  EmptyLine,
  Metric,
  ProgressBar,
} from './reporting-ui'
import { PendingApprovalsCard } from './pending-approvals-card'

function exportHref(data: DashboardOverview) {
  const params = new URLSearchParams({
    dateFrom: data.query.dateFrom,
    dateTo: data.query.dateTo,
  })
  if (data.query.departmentId) params.set('departmentId', data.query.departmentId)
  if (data.query.projectId) params.set('projectId', data.query.projectId)
  return `/api/reports/export?${params.toString()}`
}

export function DashboardPage({
  data,
  approvalInbox,
  canViewReports,
  canExport,
}: {
  data: DashboardOverview
  approvalInbox: PendingApprovalsResult | null
  canViewReports: boolean
  canExport: boolean
}) {
  const budgetTone = data.summary.variance > 0 ? 'danger' : 'default'
  return (
    <main className="mx-auto w-full max-w-[1760px] space-y-6 px-4 py-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Рабочий обзор</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Состояние проектов, команды, бюджета и имущества
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canViewReports && (
            <Button asChild variant="outline">
              <Link href="/reports">
                <ChartNoAxesCombined className="mr-2 h-4 w-4" />
                Отчётность
              </Link>
            </Button>
          )}
          {canExport && (
            <Button asChild>
              <a href={exportHref(data)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Экспорт Excel
              </a>
            </Button>
          )}
        </div>
      </header>

      <ReportFilters action="/" data={data} />

      <section className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-6">
        <Metric
          label="Команда"
          value={`${data.summary.headcount}`}
          detail={`${data.summary.occupiedRate.toLocaleString('ru-RU')} ставки · ${data.summary.occupancy}% занято`}
          icon={Users}
        />
        <Metric
          label="Проекты"
          value={`${data.summary.count}`}
          detail={`Средний прогресс ${data.summary.averageProgress}%`}
          icon={BriefcaseBusiness}
        />
        <Metric
          label="Бюджет"
          value={formatCurrency(data.summary.actualBudget)}
          detail={`${data.summary.budgetUsage}% от плана`}
          icon={ReceiptRussianRuble}
          tone={budgetTone}
        />
        <Metric
          label="Имущество"
          value={`${data.summary.assetCount}`}
          detail={formatCurrency(data.summary.assetValue)}
          icon={Package}
        />
        <Metric
          label="Просрочено"
          value={`${data.summary.overdueTasks}`}
          detail="задач требуют внимания"
          icon={Clock3}
          tone={data.summary.overdueTasks ? 'danger' : 'default'}
        />
        <Metric
          label="Сроки"
          value={`${data.summary.contractsExpiring + data.summary.assetAttention}`}
          detail="договоров и активов"
          icon={AlertTriangle}
          tone={data.summary.contractsExpiring + data.summary.assetAttention ? 'warning' : 'default'}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Активные проекты</CardTitle>
            <Link href="/projects" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Все проекты <ArrowUpRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {data.activeProjects.length ? (
              <div className="divide-y">
                {data.activeProjects.slice(0, 8).map((project) => {
                  const usage = project.plannedBudget > 0
                    ? Math.round((project.actualBudget / project.plannedBudget) * 100)
                    : 0
                  return (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="grid gap-3 py-4 first:pt-0 last:pb-0 hover:text-primary md:grid-cols-[minmax(0,1fr)_160px_150px]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{project.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {project.code} · {project.tasksCompleted}/{project.tasksTotal} задач
                        </p>
                      </div>
                      <div>
                        <div className="mb-1.5 flex justify-between text-xs">
                          <span className="text-muted-foreground">Прогресс</span>
                          <span>{project.progress}%</span>
                        </div>
                        <ProgressBar value={project.progress} tone={project.progress === 100 ? 'success' : 'default'} />
                      </div>
                      <div>
                        <div className="mb-1.5 flex justify-between text-xs">
                          <span className="text-muted-foreground">Бюджет</span>
                          <span>{usage}%</span>
                        </div>
                        <ProgressBar value={usage} tone={usage > 100 ? 'danger' : 'default'} />
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : <EmptyLine>Нет активных проектов в выбранном контуре</EmptyLine>}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {approvalInbox && (
            <PendingApprovalsCard
              requests={approvalInbox.requests}
              total={approvalInbox.total}
            />
          )}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Кто отсутствует сегодня</CardTitle>
            </CardHeader>
            <CardContent>
              {data.currentAbsences.length ? (
                <div className="divide-y">
                  {data.currentAbsences.slice(0, 6).map((absence) => (
                    <Link key={absence.id} href={`/employees/${absence.employeeId}`} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{absence.employee}</p>
                        <p className="truncate text-xs text-muted-foreground">{absence.department}</p>
                      </div>
                      <Badge variant="secondary">{VACATION_TYPE_LABELS[absence.type] || absence.type}</Badge>
                    </Link>
                  ))}
                </div>
              ) : <EmptyLine>Все сотрудники на месте</EmptyLine>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Окончание договоров</CardTitle>
            </CardHeader>
            <CardContent>
              {data.contracts.length ? (
                <div className="divide-y">
                  {data.contracts.slice(0, 6).map((contract) => (
                    <Link key={contract.id} href={`/employees/${contract.id}`} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{contract.employee}</p>
                        <p className="truncate text-xs text-muted-foreground">{contract.position}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium">{formatDate(contract.contractEndDate)}</p>
                        <p className="text-xs text-amber-700">через {contract.daysLeft} дн.</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : <EmptyLine>Нет окончаний в ближайшие 90 дней</EmptyLine>}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Просроченные задачи</CardTitle>
          </CardHeader>
          <CardContent>
            {data.overdueTasks.length ? (
              <div className="divide-y">
                {data.overdueTasks.slice(0, 8).map((task) => (
                  <Link key={task.id} href={`/projects/${task.project.id}`} className="grid gap-2 py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {task.project.code} · {task.responsible}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-sm font-medium text-red-700">{task.overdueDays} дн.</p>
                      <p className="text-xs text-muted-foreground">{task.progress}% готово</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : <EmptyLine>Просроченных задач нет</EmptyLine>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Имущество требует внимания</CardTitle>
          </CardHeader>
          <CardContent>
            {data.assetAttention.length ? (
              <div className="divide-y">
                {data.assetAttention.slice(0, 8).map((asset) => (
                  <Link key={asset.id} href={`/assets/${asset.id}`} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{asset.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {asset.inventoryNumber} · {asset.mol.department}
                      </p>
                    </div>
                    <Badge variant={asset.status === 'UNDER_REPAIR' ? 'destructive' : 'secondary'}>
                      {ASSET_STATUS_LABELS[asset.status] || asset.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : <EmptyLine>Нет активов в ремонте или к списанию</EmptyLine>}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Последние операции</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentActivity.length ? (
            <div className="divide-y">
              {data.recentActivity.map((activity) => {
                const content = (
                  <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{activity.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ACTIVITY_LABELS[activity.description] || activity.description}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDateTime(activity.date)}
                    </div>
                  </div>
                )
                return activity.href
                  ? <Link key={activity.id} href={activity.href}>{content}</Link>
                  : <div key={activity.id}>{content}</div>
              })}
            </div>
          ) : <EmptyLine />}
        </CardContent>
      </Card>
    </main>
  )
}
