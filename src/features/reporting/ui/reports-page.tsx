import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { DashboardOverview } from '../contracts/view-model'
import { ASSET_STATUS_LABELS, VACATION_TYPE_LABELS } from '../contracts/labels'
import { ReportFilters } from './report-filters'
import { EmptyLine, ProgressBar } from './reporting-ui'

function exportHref(data: DashboardOverview) {
  const params = new URLSearchParams({
    dateFrom: data.query.dateFrom,
    dateTo: data.query.dateTo,
  })
  if (data.query.departmentId) params.set('departmentId', data.query.departmentId)
  if (data.query.projectId) params.set('projectId', data.query.projectId)
  return `/api/reports/export?${params.toString()}`
}

export function ReportsPage({
  data,
  canExport,
}: {
  data: DashboardOverview
  canExport: boolean
}) {
  return (
    <main className="mx-auto w-full max-w-[1760px] space-y-6 px-4 py-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Рабочий обзор</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Отчётность и аналитика</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Численность, ставки, ФОТ, проекты, имущество и отпуска
          </p>
        </div>
        {canExport && (
          <Button asChild>
            <a href={exportHref(data)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Скачать Excel
            </a>
          </Button>
        )}
      </header>

      <ReportFilters action="/reports" data={data} />

      <Card>
        <CardHeader><CardTitle className="text-lg">Численность, ставки и ФОТ</CardTitle></CardHeader>
        <CardContent>
          {data.analytics.workforceByDepartment.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Подразделение</TableHead>
                  <TableHead className="text-right">Сотрудников</TableHead>
                  <TableHead className="text-right">Занято ставок</TableHead>
                  <TableHead className="text-right">Штатных ставок</TableHead>
                  <TableHead className="min-w-36">Занятость</TableHead>
                  <TableHead className="text-right">Плановый ФОТ</TableHead>
                  <TableHead className="text-right">Фактический ФОТ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.analytics.workforceByDepartment.map((row) => (
                  <TableRow key={row.departmentId}>
                    <TableCell className="font-medium">{row.department}</TableCell>
                    <TableCell className="text-right">{row.headcount}</TableCell>
                    <TableCell className="text-right">{row.occupiedRate.toLocaleString('ru-RU')}</TableCell>
                    <TableCell className="text-right">{row.staffRate.toLocaleString('ru-RU')}</TableCell>
                    <TableCell>
                      <div className="mb-1 text-right text-xs">{row.occupancy}%</div>
                      <ProgressBar value={row.occupancy} tone={row.occupancy > 100 ? 'danger' : 'default'} />
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.plannedFot)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.actualFot)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <EmptyLine />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Проекты: сроки и план-факт</CardTitle></CardHeader>
        <CardContent>
          {data.analytics.projects.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Проект</TableHead>
                  <TableHead>Срок</TableHead>
                  <TableHead className="min-w-40">Прогресс</TableHead>
                  <TableHead className="text-right">План</TableHead>
                  <TableHead className="text-right">Факт</TableHead>
                  <TableHead className="text-right">Отклонение</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.analytics.projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Link href={`/projects/${project.id}`} className="font-medium hover:text-primary">
                        {project.code} · {project.name}
                      </Link>
                    </TableCell>
                    <TableCell>{project.endDate ? formatDate(project.endDate) : 'Без срока'}</TableCell>
                    <TableCell>
                      <div className="mb-1 text-right text-xs">{project.progress}%</div>
                      <ProgressBar value={project.progress} />
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(project.plannedBudget)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(project.actualBudget)}</TableCell>
                    <TableCell className={project.actualBudget > project.plannedBudget ? 'text-right text-red-700' : 'text-right text-emerald-700'}>
                      {formatCurrency(project.actualBudget - project.plannedBudget)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : <EmptyLine />}
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">Имущество по статусам</CardTitle></CardHeader>
          <CardContent>
            {data.analytics.assetsByStatus.length ? (
              <div className="divide-y">
                {data.analytics.assetsByStatus.map((row) => (
                  <div key={row.status} className="flex items-center justify-between gap-4 py-3 first:pt-0">
                    <div>
                      <p className="text-sm font-medium">{ASSET_STATUS_LABELS[row.status] || row.status}</p>
                      <p className="text-xs text-muted-foreground">{row.count} ед.</p>
                    </div>
                    <p className="text-sm font-medium">{formatCurrency(row.value)}</p>
                  </div>
                ))}
              </div>
            ) : <EmptyLine />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Отсутствия за период</CardTitle></CardHeader>
          <CardContent>
            {data.analytics.vacationsByType.length ? (
              <div className="divide-y">
                {data.analytics.vacationsByType.map((row) => (
                  <div key={row.type} className="flex items-center justify-between gap-4 py-3 first:pt-0">
                    <p className="text-sm font-medium">{VACATION_TYPE_LABELS[row.type] || row.type}</p>
                    <p className="text-sm">{row.count}</p>
                  </div>
                ))}
              </div>
            ) : <EmptyLine />}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
