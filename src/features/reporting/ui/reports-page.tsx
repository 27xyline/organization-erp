'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  FileSpreadsheet,
  Trash2,
  RefreshCw,
  BarChart4,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { DashboardOverview } from '../contracts/view-model'
import type { ReportMetric } from '../contracts/report-presets'
import { ASSET_STATUS_LABELS, VACATION_TYPE_LABELS } from '../contracts/labels'
import { ReportFilters } from './report-filters'
import { EmptyLine, ProgressBar } from './reporting-ui'

const metricOptions: Record<'department' | 'project', Array<[ReportMetric, string]>> = {
  department: [
    ['headcount', 'Численность штата'],
    ['occupiedRate', 'Занято ставок'],
    ['plannedFot', 'Плановый ФОТ'],
    ['assetValue', 'Стоимость имущества'],
  ],
  project: [
    ['projectBudget', 'Бюджеты проектов'],
    ['actualFot', 'Фактический ФОТ проектов'],
    ['assetValue', 'Имущество на проектах'],
  ],
}

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
  canReadTurnover,
  canReadProfitability,
  canReadDepreciation,
  canReadVacations,
  canGroupByDepartment,
  canGroupByProject,
  availableCustomMetrics,
  defaultCustomGroupBy,
}: {
  data: DashboardOverview
  canExport: boolean
  canReadTurnover: boolean
  canReadProfitability: boolean
  canReadDepreciation: boolean
  canReadVacations: boolean
  canGroupByDepartment: boolean
  canGroupByProject: boolean
  availableCustomMetrics: ReportMetric[]
  defaultCustomGroupBy: 'department' | 'project'
}) {
  const [activeTab, setActiveTab] = useState('summary')

  // Turnover State
  const [turnoverData, setTurnoverData] = useState<any>(null)
  const [loadingTurnover, setLoadingTurnover] = useState(false)

  // Profitability State
  const [profitabilityData, setProfitabilityData] = useState<any[]>([])
  const [loadingProfitability, setLoadingProfitability] = useState(false)

  // Depreciation State
  const [depreciationData, setDepreciationData] = useState<any>(null)
  const [loadingDepreciation, setLoadingDepreciation] = useState(false)

  // Vacations State
  const [vacationsData, setVacationsData] = useState<any[]>([])
  const [loadingVacations, setLoadingVacations] = useState(false)

  // Presets & Constructor State
  const [presets, setPresets] = useState<any[]>([])
  const [presetName, setPresetName] = useState('')
  const [groupBy, setGroupBy] = useState<'department' | 'project'>(defaultCustomGroupBy)
  const [selectedMetrics, setSelectedMetrics] = useState<ReportMetric[]>(() =>
    metricOptions[defaultCustomGroupBy]
      .map(([metric]) => metric)
      .filter((metric) => availableCustomMetrics.includes(metric))
      .slice(0, 2),
  )
  const [customReportData, setCustomReportData] = useState<any[]>([])
  const [customReportError, setCustomReportError] = useState<string | null>(null)
  const [loadingCustom, setLoadingCustom] = useState(false)
  const [loadingPresets, setLoadingPresets] = useState(false)

  const dateFrom = data.query.dateFrom
  const dateTo = data.query.dateTo
  const departmentId = data.query.departmentId
  const projectId = data.query.projectId
  const customGroups = {
    department: canGroupByDepartment,
    project: canGroupByProject,
  }
  const metricsForGroup = (group: 'department' | 'project') => metricOptions[group]
    .map(([metric]) => metric)
    .filter((metric) => availableCustomMetrics.includes(metric))

  // Fetch Turnover Data
  const fetchTurnover = async () => {
    setLoadingTurnover(true)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (departmentId) params.set('departmentId', departmentId)
      const res = await fetch(`/api/reports/turnover?${params.toString()}`)
      if (res.ok) {
        setTurnoverData(await res.json())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingTurnover(false)
    }
  }

  // Fetch Profitability Data
  const fetchProfitability = async () => {
    setLoadingProfitability(true)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (projectId) params.set('projectId', projectId)
      const res = await fetch(`/api/reports/profitability?${params.toString()}`)
      if (res.ok) {
        setProfitabilityData(await res.json())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingProfitability(false)
    }
  }

  // Fetch Depreciation Data
  const fetchDepreciation = async () => {
    setLoadingDepreciation(true)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (departmentId) params.set('departmentId', departmentId)
      const res = await fetch(`/api/reports/depreciation?${params.toString()}`)
      if (res.ok) {
        setDepreciationData(await res.json())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingDepreciation(false)
    }
  }

  // Fetch Vacations Data
  const fetchVacations = async () => {
    setLoadingVacations(true)
    try {
      const params = new URLSearchParams({ dateFrom, dateTo })
      if (departmentId) params.set('departmentId', departmentId)
      const res = await fetch(`/api/reports/vacations?${params.toString()}`)
      if (res.ok) {
        setVacationsData(await res.json())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingVacations(false)
    }
  }

  // Fetch Presets
  const fetchPresets = async () => {
    setLoadingPresets(true)
    try {
      const res = await fetch('/api/reports/presets')
      if (res.ok) {
        setPresets(await res.json())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingPresets(false)
    }
  }

  // Save Preset
  const savePreset = async () => {
    if (!presetName.trim() || !selectedMetrics.length) return
    try {
      const res = await fetch('/api/reports/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: presetName,
          metrics: selectedMetrics,
          groupBy,
          filters: { departmentId, projectId },
        }),
      })
      if (res.ok) {
        setPresetName('')
        fetchPresets()
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Delete Preset
  const deletePreset = async (id: string) => {
    try {
      const res = await fetch(`/api/reports/presets?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchPresets()
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Load Preset
  const loadPreset = (preset: any) => {
    const presetGroup = preset.groupBy as 'department' | 'project'
    if (!customGroups[presetGroup]) {
      setCustomReportError('У вас нет доступа к этой группировке пресета')
      return
    }
    const metrics = (preset.metrics as ReportMetric[])
      .filter((metric) => metricsForGroup(presetGroup).includes(metric))
    if (!metrics.length) {
      setCustomReportError('В пресете нет показателей, доступных вашей роли')
      return
    }
    setGroupBy(presetGroup)
    setSelectedMetrics(metrics)
    void buildCustomReport(presetGroup, metrics)
  }

  // Build Custom Report
  const buildCustomReport = async (
    gBy = groupBy,
    metrics: ReportMetric[] = selectedMetrics,
  ) => {
    if (!customGroups[gBy] || !metrics.length) return
    setLoadingCustom(true)
    setCustomReportError(null)
    try {
      const res = await fetch('/api/reports/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset: { name: 'Temp', metrics, groupBy: gBy },
          query: { dateFrom, dateTo, departmentId, projectId },
        }),
      })
      if (res.ok) {
        setCustomReportData(await res.json())
      } else {
        const body = await res.json().catch(() => ({}))
        setCustomReportError(body.error?.message || 'Не удалось сформировать отчёт')
      }
    } catch (e) {
      console.error(e)
      setCustomReportError('Не удалось связаться с сервером')
    } finally {
      setLoadingCustom(false)
    }
  }

  function changeGroup(group: 'department' | 'project') {
    if (!customGroups[group]) return
    const metrics = metricsForGroup(group).slice(0, 2)
    setGroupBy(group)
    setSelectedMetrics(metrics)
    setCustomReportData([])
    setCustomReportError(null)
    if (activeTab === 'constructor') void buildCustomReport(group, metrics)
  }

  useEffect(() => {
    if (activeTab === 'turnover') fetchTurnover()
    if (activeTab === 'profitability') fetchProfitability()
    if (activeTab === 'depreciation') fetchDepreciation()
    if (activeTab === 'vacations') fetchVacations()
    if (activeTab === 'constructor') {
      fetchPresets()
      buildCustomReport()
    }
  }, [activeTab, dateFrom, dateTo, departmentId, projectId])

  const toggleMetric = (metric: ReportMetric) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric],
    )
  }
  const canBuildCustom = (canGroupByDepartment && metricsForGroup('department').length > 0) ||
    (canGroupByProject && metricsForGroup('project').length > 0)

  return (
    <main className="mx-auto w-full max-w-[1760px] space-y-6 px-4 py-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />Рабочий обзор
            </Link>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="summary">Сводная панель</TabsTrigger>
          {canReadTurnover && <TabsTrigger value="turnover">Текучесть кадров</TabsTrigger>}
          {canReadProfitability && <TabsTrigger value="profitability">Рентабельность проектов</TabsTrigger>}
          {canReadDepreciation && <TabsTrigger value="depreciation">Амортизация и ОС</TabsTrigger>}
          {canReadVacations && <TabsTrigger value="vacations">Календарь отпусков</TabsTrigger>}
          {canBuildCustom && <TabsTrigger value="constructor">Конструктор</TabsTrigger>}
        </TabsList>

        {/* Tab 1: Summary Panel */}
        <TabsContent value="summary" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Численность, ставки и ФОТ</CardTitle>
            </CardHeader>
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
                        <TableCell className="text-right">
                          {row.occupiedRate.toLocaleString('ru-RU')}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.staffRate.toLocaleString('ru-RU')}
                        </TableCell>
                        <TableCell>
                          <div className="mb-1 text-right text-xs">{row.occupancy}%</div>
                          <ProgressBar
                            value={row.occupancy}
                            tone={row.occupancy > 100 ? 'danger' : 'default'}
                          />
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.plannedFot)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.actualFot)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyLine />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Проекты: сроки и план-факт</CardTitle>
            </CardHeader>
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
                        <TableCell>
                          {project.endDate ? formatDate(project.endDate) : 'Без срока'}
                        </TableCell>
                        <TableCell>
                          <div className="mb-1 text-right text-xs">{project.progress}%</div>
                          <ProgressBar value={project.progress} />
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(project.plannedBudget)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(project.actualBudget)}</TableCell>
                        <TableCell
                          className={
                            project.actualBudget > project.plannedBudget
                              ? 'text-right text-red-700'
                              : 'text-right text-emerald-700'
                          }
                        >
                          {formatCurrency(project.actualBudget - project.plannedBudget)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyLine />
              )}
            </CardContent>
          </Card>

          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Имущество по статусам</CardTitle>
              </CardHeader>
              <CardContent>
                {data.analytics.assetsByStatus.length ? (
                  <div className="divide-y">
                    {data.analytics.assetsByStatus.map((row) => (
                      <div
                        key={row.status}
                        className="flex items-center justify-between gap-4 py-3 first:pt-0"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {ASSET_STATUS_LABELS[row.status] || row.status}
                          </p>
                          <p className="text-xs text-muted-foreground">{row.count} ед.</p>
                        </div>
                        <p className="text-sm font-medium">{formatCurrency(row.value)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyLine />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Отсутствия за период</CardTitle>
              </CardHeader>
              <CardContent>
                {data.analytics.vacationsByType.length ? (
                  <div className="divide-y">
                    {data.analytics.vacationsByType.map((row) => (
                      <div
                        key={row.type}
                        className="flex items-center justify-between gap-4 py-3 first:pt-0"
                      >
                        <p className="text-sm font-medium">
                          {VACATION_TYPE_LABELS[row.type] || row.type}
                        </p>
                        <p className="text-sm">{row.count}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyLine />
                )}
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        {/* Tab 2: Turnover Rate */}
        <TabsContent value="turnover" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Отчёт по текучести кадров</span>
                {loadingTurnover && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {turnoverData && (
                <div className="grid gap-4 md:grid-cols-5 text-center">
                  <div className="bg-muted/30 p-4 rounded-lg">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">На начало периода</p>
                    <p className="text-3xl font-bold mt-1 text-slate-800">{turnoverData.activeAtStart}</p>
                  </div>
                  <div className="bg-muted/30 p-4 rounded-lg">
                    <p className="text-xs text-muted-foreground uppercase font-semibold">На конец периода</p>
                    <p className="text-3xl font-bold mt-1 text-slate-800">{turnoverData.activeAtEnd}</p>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                    <p className="text-xs text-emerald-800 uppercase font-semibold">Принято сотрудников</p>
                    <p className="text-3xl font-bold mt-1 text-emerald-700">{turnoverData.hiredCount}</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                    <p className="text-xs text-red-800 uppercase font-semibold">Уволено сотрудников</p>
                    <p className="text-3xl font-bold mt-1 text-red-700">{turnoverData.dismissedCount}</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-800 uppercase font-semibold">Коэффициент текучести</p>
                    <p className="text-3xl font-bold mt-1 text-blue-700">{turnoverData.turnoverRate}%</p>
                  </div>
                </div>
              )}
              <div className="text-xs text-muted-foreground leading-relaxed">
                * Коэффициент текучести рассчитывается как: 
                <code className="bg-muted px-1.5 py-0.5 rounded mx-1 font-mono text-[11px]">(Уволено / Среднесписочная численность) * 100%</code>,
                где среднесписочная численность — полусумма количества сотрудников на начало и на конец выбранного периода.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Profitability */}
        <TabsContent value="profitability" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Рентабельность проектов</span>
                {loadingProfitability && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {profitabilityData.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Проект</TableHead>
                      <TableHead className="text-right">Плановый доход</TableHead>
                      <TableHead className="text-right">Фактический доход</TableHead>
                      <TableHead className="text-right">Расходы ФОТ</TableHead>
                      <TableHead className="text-right">Закупки</TableHead>
                      <TableHead className="text-right">Общие расходы</TableHead>
                      <TableHead className="text-right">Прибыль</TableHead>
                      <TableHead className="text-right">Рентабельность</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitabilityData.map((proj) => (
                      <TableRow key={proj.id}>
                        <TableCell className="font-medium">
                          {proj.code} · {proj.name}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(proj.plannedRevenue)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(proj.actualRevenue)}</TableCell>
                        <TableCell className="text-right text-slate-600">{formatCurrency(proj.payrollCost)}</TableCell>
                        <TableCell className="text-right text-slate-600">{formatCurrency(proj.procurementCost)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(proj.totalCost)}</TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            proj.profit >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {formatCurrency(proj.profit)}
                        </TableCell>
                        <TableCell>
                          <div className="mb-1 text-right text-xs font-semibold text-slate-800">
                            {proj.profitabilityRate}%
                          </div>
                          <ProgressBar
                            value={Math.max(0, Math.min(100, proj.profitabilityRate))}
                            tone={proj.profitabilityRate >= 20 ? 'default' : 'danger'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyLine />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Depreciation */}
        <TabsContent value="depreciation" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Амортизация основных средств</span>
                {loadingDepreciation && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {depreciationData?.assets.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Инв. номер</TableHead>
                      <TableHead>Наименование</TableHead>
                      <TableHead className="text-right">Первоначальная стоимость</TableHead>
                      <TableHead className="text-right">Амортизация за период</TableHead>
                      <TableHead className="text-right">Остаточная стоимость</TableHead>
                      <TableHead>МОЛ</TableHead>
                      <TableHead>Подразделение</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {depreciationData.assets.map((asset: any) => (
                      <TableRow key={asset.id}>
                        <TableCell className="font-mono text-xs">{asset.inventoryNumber}</TableCell>
                        <TableCell className="font-medium">{asset.name}</TableCell>
                        <TableCell className="text-right">{formatCurrency(asset.initialCost)}</TableCell>
                        <TableCell className="text-right text-red-600">
                          -{formatCurrency(asset.depreciation)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(asset.residualValue)}
                        </TableCell>
                        <TableCell>{asset.mol}</TableCell>
                        <TableCell>{asset.department}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyLine />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Движение имущества (трансферы и поступления)</CardTitle>
            </CardHeader>
            <CardContent>
              {depreciationData?.movements.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Имущество</TableHead>
                      <TableHead>От кого</TableHead>
                      <TableHead>Кому</TableHead>
                      <TableHead className="text-right">Количество</TableHead>
                      <TableHead>Основание</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {depreciationData.movements.map((move: any) => (
                      <TableRow key={move.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(move.date)}</TableCell>
                        <TableCell>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              move.type === 'RECEIPT'
                                ? 'bg-emerald-100 text-emerald-800'
                                : move.type === 'TRANSFER'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {move.type === 'RECEIPT'
                              ? 'Поступление'
                              : move.type === 'TRANSFER'
                              ? 'Перемещение'
                              : 'Списание'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{move.assetName}</span>
                          <span className="block text-xs text-muted-foreground font-mono">
                            {move.inventoryNumber}
                          </span>
                        </TableCell>
                        <TableCell>{move.fromMol}</TableCell>
                        <TableCell>{move.toMol}</TableCell>
                        <TableCell className="text-right font-medium">{move.quantity}</TableCell>
                        <TableCell className="max-w-xs truncate" title={move.reason}>
                          {move.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyLine />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: Vacations */}
        <TabsContent value="vacations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Календарный реестр отпусков</span>
                {loadingVacations && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vacationsData.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Сотрудник</TableHead>
                      <TableHead>Подразделение</TableHead>
                      <TableHead>Тип отпуска</TableHead>
                      <TableHead>Дата начала</TableHead>
                      <TableHead>Дата окончания</TableHead>
                      <TableHead className="text-right">Дней</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vacationsData.map((vac) => (
                      <TableRow key={vac.id}>
                        <TableCell className="font-semibold text-slate-800">{vac.employeeName}</TableCell>
                        <TableCell>{vac.department}</TableCell>
                        <TableCell>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-800">
                            {VACATION_TYPE_LABELS[vac.type] || vac.type}
                          </span>
                        </TableCell>
                        <TableCell>{formatDate(vac.startDate)}</TableCell>
                        <TableCell>{formatDate(vac.endDate)}</TableCell>
                        <TableCell className="text-right font-bold text-slate-700">{vac.durationDays}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyLine />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 6: Report Constructor */}
        <TabsContent value="constructor" className="grid gap-6 lg:grid-cols-[380px_1fr] mt-4">
          {/* Constructor Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-md flex items-center gap-2">
                  <BarChart4 className="h-4 w-4" /> Настройки конструктора
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Группировка данных</label>
                  {canGroupByDepartment && canGroupByProject ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={groupBy === 'department' ? 'default' : 'outline'}
                        onClick={() => changeGroup('department')}
                        className="flex-1 text-xs"
                      >
                        По отделам
                      </Button>
                      <Button
                        type="button"
                        variant={groupBy === 'project' ? 'default' : 'outline'}
                        onClick={() => changeGroup('project')}
                        className="flex-1 text-xs"
                      >
                        По проектам
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {groupBy === 'department' ? 'По отделам' : 'По проектам'}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Показатели</label>
                  <div className="grid gap-2 rounded-lg border bg-slate-50/50 p-3">
                    {metricOptions[groupBy]
                      .filter(([metric]) => availableCustomMetrics.includes(metric))
                      .map(([metric, label]) => (
                        <label key={metric} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedMetrics.includes(metric)}
                            onChange={() => toggleMetric(metric)}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          {label}
                        </label>
                      ))}
                    {!metricsForGroup(groupBy).length && (
                      <p className="text-sm text-muted-foreground">Нет доступных показателей для этой группировки.</p>
                    )}
                  </div>
                </div>

                <Button
                  onClick={() => buildCustomReport()}
                  className="w-full text-xs"
                  disabled={!selectedMetrics.length || loadingCustom}
                >
                  Сформировать отчет
                </Button>
                {customReportError && <p role="alert" className="text-sm text-destructive">{customReportError}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-md flex items-center gap-2">
                  <Save className="h-4 w-4" /> Сохранить пресет
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Название пресета"
                  value={presetName}
                  onChange={(e: any) => setPresetName(e.target.value)}
                  className="text-xs"
                />
                <Button
                  variant="outline"
                  onClick={savePreset}
                  className="w-full gap-2 text-xs"
                  disabled={!presetName.trim() || !selectedMetrics.length}
                >
                  <Save className="h-3.5 w-3.5" /> Сохранить конфигурацию
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Constructor Table & Preset List */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Результат построения</span>
                  {loadingCustom && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {customReportData.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Группа ({groupBy === 'department' ? 'Отдел' : 'Проект'})</TableHead>
                        {selectedMetrics.includes('headcount') && (
                          <TableHead className="text-right">Численность</TableHead>
                        )}
                        {selectedMetrics.includes('occupiedRate') && (
                          <TableHead className="text-right">Ставок занято</TableHead>
                        )}
                        {selectedMetrics.includes('plannedFot') && (
                          <TableHead className="text-right">Плановый ФОТ</TableHead>
                        )}
                        {selectedMetrics.includes('projectBudget') && (
                          <>
                            <TableHead className="text-right">План. бюджет</TableHead>
                            <TableHead className="text-right">Факт. бюджет</TableHead>
                          </>
                        )}
                        {selectedMetrics.includes('actualFot') && (
                          <TableHead className="text-right">Фактический ФОТ</TableHead>
                        )}
                        {selectedMetrics.includes('assetValue') && (
                          <TableHead className="text-right">Имущество</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customReportData.map((row) => (
                        <TableRow key={row.groupKey}>
                          <TableCell className="font-semibold text-slate-800">{row.groupName}</TableCell>
                          {selectedMetrics.includes('headcount') && (
                            <TableCell className="text-right">{row.headcount}</TableCell>
                          )}
                          {selectedMetrics.includes('occupiedRate') && (
                            <TableCell className="text-right">{row.occupiedRate}</TableCell>
                          )}
                          {selectedMetrics.includes('plannedFot') && (
                            <TableCell className="text-right">{formatCurrency(row.plannedFot)}</TableCell>
                          )}
                          {selectedMetrics.includes('projectBudget') && (
                            <>
                              <TableCell className="text-right">{formatCurrency(row.plannedBudget)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(row.actualBudget)}</TableCell>
                            </>
                          )}
                          {selectedMetrics.includes('actualFot') && (
                            <TableCell className="text-right">{formatCurrency(row.actualFot)}</TableCell>
                          )}
                          {selectedMetrics.includes('assetValue') && (
                            <TableCell className="text-right">{formatCurrency(row.assetValue)}</TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyLine />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Сохранённые пресеты</CardTitle>
              </CardHeader>
              <CardContent>
                {presets.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {presets.map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between border p-3 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div className="min-w-0 cursor-pointer" onClick={() => loadPreset(preset)}>
                          <p className="font-medium text-sm truncate text-slate-800">{preset.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {preset.groupBy === 'department' ? 'Отделы' : 'Проекты'} · {preset.metrics.length} пок.
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deletePreset(preset.id)}
                          className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs text-muted-foreground">Нет сохраненных конфигураций</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  )
}
