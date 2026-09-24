import { notFound } from 'next/navigation'
import Link from 'next/link'
import { FinancePlanType } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  ArrowRightLeft,
  Calendar,
  CheckSquare,
  Edit,
  FolderKanban,
  Target,
  Trophy,
  Wallet,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ProjectStatusLabels } from '@/features/projects/contracts/types'
import { formatDate, formatCurrency, formatDateTime } from '@/lib/utils'
import { LazyProjectGantt } from '@/features/projects/ui/lazy-gantt'
import { ProjectPayrollSection } from '@/features/finance/ui/project-payroll-section'
import { ProjectService } from '@/features/projects/application/project.service'
import { requirePagePermission } from '@/lib/auth/authorization'
import { getDocumentService } from '@/features/documents/application/document.service'
import type { DocumentView } from '@/features/documents/contracts/ui-types'
import { ProjectWorkspaceService } from '@/features/projects/application/project-workspace.service'
import { ProjectWorkspaceSection } from './project-workspace-section'
import { ProjectDetailTabs, type ProjectDetailTab } from '@/features/projects/ui/project-detail-tabs'

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectPage(props: ProjectPageProps) {
  const [user, params] = await Promise.all([
    requirePagePermission('projects.read'),
    props.params,
  ])
  const project = await ProjectService.getDetail(params.id, user.access)

  if (!project) {
    notFound()
  }

  const projectTarget = { projectId: project.id }
  const canEditProject = user.access.allows('projects.update', projectTarget)
  const canReadTasks = user.access.allows('tasks.read', projectTarget)
  const canEditTasks = user.access.allows('tasks.create', projectTarget) &&
    user.access.allows('tasks.update', projectTarget) &&
    user.access.allows('tasks.delete', projectTarget)
  const canReadAssets = user.access.allows('assets.read', projectTarget)
  const canReadMembers = user.access.allows('projectMembers.read', projectTarget)
  const canManageMembers = user.access.allows('projectMembers.create', projectTarget) &&
    user.access.allows('projectMembers.update', projectTarget)
  const canReadPayroll = user.access.allows('projectPayroll.read', projectTarget)
  const canEditPayroll = user.access.allows('projectPayroll.update', projectTarget)
  const documentTarget = { documentProjectId: project.id }
  const canReadDocuments = user.access.allows('documents.read', documentTarget)
  const canCreateDocuments = user.access.allows('documents.create', documentTarget)
  const [documentResult, projectActivities] = await Promise.all([
    canReadDocuments
      ? getDocumentService().list({
          page: 1,
          pageSize: 10,
          projectId: project.id,
          archived: false,
        }, { id: user.id, access: user.access })
      : Promise.resolve({ documents: [], total: 0 }),
    ProjectWorkspaceService.activity(project.id, {
      canReadTasks,
      canReadDocuments,
      canReadAll: user.access.has('auditLogs.read'),
    }),
  ])
  const projectDocuments = documentResult.documents.map((document) => ({
    ...document,
    archivedAt: document.archivedAt?.toISOString() || null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    versions: document.versions.map((version) => ({
      ...version,
      createdAt: version.createdAt.toISOString(),
    })),
  })) as DocumentView[]

  // Calculate budget remaining
  const remainingBudget = Number(project.plannedBudget) - Number(project.actualBudget)
  const projectDurationDays = project.startDate && project.endDate
    ? Math.ceil((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / (1000 * 60 * 60 * 24))
    : null

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
        reason: operation.reason,
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

  const projectTabs: ProjectDetailTab[] = [
    {
      id: 'overview',
      label: 'Обзор',
      content: (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,1fr)]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">О проекте</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <p className="flex items-center gap-2 text-sm font-medium"><FolderKanban className="h-4 w-4" />Описание</p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{project.description || 'Нет описания'}</p>
              </div>
              <div className="space-y-2 border-t pt-4">
                <p className="flex items-center gap-2 text-sm font-medium"><Target className="h-4 w-4" />Цели</p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{project.goals || 'Нет целей'}</p>
              </div>
              <div className="space-y-2 border-t pt-4">
                <p className="flex items-center gap-2 text-sm font-medium"><CheckSquare className="h-4 w-4" />План работ</p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{project.tasks || 'Нет задач'}</p>
              </div>
              <div className="space-y-2 border-t pt-4 sm:col-span-2">
                <p className="flex items-center gap-2 text-sm font-medium"><Trophy className="h-4 w-4" />Ожидаемый результат</p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{project.results || 'Нет результатов'}</p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" />Бюджет</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3 border-b py-2">
                  <span className="text-sm text-muted-foreground">Активов проекта</span>
                  <span className="text-sm font-medium">{project._count.assets}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b py-2">
                  <span className="text-sm text-muted-foreground">План</span>
                  <span className="text-sm font-medium tabular-nums">{formatCurrency(Number(project.plannedBudget))}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b py-2">
                  <span className="text-sm text-muted-foreground">Факт</span>
                  <span className="text-sm font-medium tabular-nums">{formatCurrency(Number(project.actualBudget))}</span>
                </div>
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-muted-foreground">Остаток</span>
                  <span className={`text-sm font-semibold tabular-nums ${remainingBudget < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(remainingBudget)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Calendar className="h-4 w-4" />Сроки</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3 border-b py-2">
                  <span className="text-sm text-muted-foreground">Начало</span>
                  <span className="text-sm font-medium">{project.startDate ? formatDate(project.startDate) : '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b py-2">
                  <span className="text-sm text-muted-foreground">Окончание</span>
                  <span className="text-sm font-medium">{project.endDate ? formatDate(project.endDate) : '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-muted-foreground">Длительность</span>
                  <span className="text-sm font-medium">{projectDurationDays !== null ? `${projectDurationDays} дней` : '—'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ),
    },
    ...(canReadTasks ? [{
      id: 'tasks',
      label: 'Задачи',
      content: (
        <div className="min-h-[700px] min-w-0 overflow-hidden">
          <LazyProjectGantt
            projectId={project.id}
            canEdit={canEditTasks}
            tasks={project.tasksList.map((task) => ({
              ...task,
              assignees: task.assignees.map((assignee) => ({
                employeeId: assignee.employeeId,
                fullName: assignee.employee.fullName,
                projectMemberId: assignee.projectMemberId,
              })),
            }))}
          />
        </div>
      ),
    }] : []),
    ...((canReadMembers || canReadPayroll) ? [{
      id: 'team',
      label: 'Команда',
      content: (
        <Card className="overflow-hidden">
          <ProjectPayrollSection
            projectId={project.id}
            canReadMembers={canReadMembers}
            canManageMembers={canManageMembers}
            canReadPayroll={canReadPayroll}
            canEditPayroll={canEditPayroll}
          />
        </Card>
      ),
    }] : []),
    ...(canReadPayroll ? [{
      id: 'finance',
      label: 'Финансы',
      content: (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-slate-50/80">
            <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" />Финансовые действия проекта</CardTitle>
            <CardDescription>Начисления по сотрудникам, связанные с этим проектом.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Всего действий</p>
                <p className="mt-2 text-lg font-semibold">{project._count.financePlanEntries}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Оклад</p>
                <p className="mt-2 text-lg font-semibold tabular-nums">{formatCurrency(okladTotal)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Надбавка</p>
                <p className="mt-2 text-lg font-semibold tabular-nums">{formatCurrency(nadbavkaTotal)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Итого</p>
                <p className="mt-2 text-lg font-semibold tabular-nums">{formatCurrency(financeTotal)}</p>
              </div>
            </div>

            {projectFinanceGroups.length > 0 ? (
              <div className="space-y-3">
                {projectFinanceGroups.map((group) => (
                  <div key={group.employeeId} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{group.employeeName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{group.employeeDepartment}</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">{formatCurrency(group.total)}</p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {group.entries.map((entry) => (
                        <div key={entry.id} className="rounded-lg border bg-white px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className={entry.type === FinancePlanType.OKLAD ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-violet-200 bg-violet-50 text-violet-700'}>
                                  {financeTypeLabels[entry.type]}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{entry.monthLabel}</span>
                              </div>
                              <p className="mt-3 text-xs text-muted-foreground">Создано: {formatDateTime(entry.createdAt)}</p>
                            </div>
                            <p className="text-sm font-semibold tabular-nums">{formatCurrency(entry.amount)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed bg-slate-50/70 p-8 text-center">
                <p className="text-sm font-medium">Пока нет финансовых действий по этому проекту</p>
                <p className="mt-2 text-sm text-muted-foreground">Начисления с привязкой к проекту появятся здесь.</p>
              </div>
            )}
          </CardContent>
        </Card>
      ),
    }] : []),
    ...(canReadAssets ? [{
      id: 'assets',
      label: 'Имущество',
      content: (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-slate-50/80">
            <CardTitle className="flex items-center gap-2 text-base"><ArrowRightLeft className="h-4 w-4" />Журнал поступлений и списаний</CardTitle>
            <CardDescription>Операции по активам, привязанным к этому проекту.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Поступления</p>
                <p className="mt-2 text-lg font-semibold tabular-nums">{formatCurrency(receiptTotal)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Списания</p>
                <p className="mt-2 text-lg font-semibold tabular-nums">{formatCurrency(disposalTotal)}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Записей</p>
                <p className="mt-2 text-lg font-semibold">{projectJournalEntries.length}</p>
              </div>
            </div>

            {projectJournalEntries.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Актив</TableHead>
                      <TableHead>Инв. номер</TableHead>
                      <TableHead>Количество</TableHead>
                      <TableHead>Сумма</TableHead>
                      <TableHead>Документ</TableHead>
                      <TableHead>Основание</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectJournalEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(entry.date)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={entry.type === 'RECEIPT' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}>
                            {entry.type === 'RECEIPT' ? 'Приход' : entry.type === 'DISPOSAL' ? 'Списание' : entry.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{entry.assetName}</TableCell>
                        <TableCell className="whitespace-nowrap">{entry.inventoryNumber}</TableCell>
                        <TableCell>{entry.quantity}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatCurrency(entry.totalCost)}</TableCell>
                        <TableCell className="max-w-[260px]">
                          <p className="text-sm">{entry.documentType}</p>
                          <p className="text-xs text-muted-foreground">{entry.documentDetails}</p>
                        </TableCell>
                        <TableCell className="max-w-[260px] text-sm text-muted-foreground">{entry.reason || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed bg-slate-50/70 p-8 text-center">
                <p className="text-sm font-medium">Пока нет операций по поступлениям и списаниям</p>
                <p className="mt-2 text-sm text-muted-foreground">Движения по активам проекта появятся в этом журнале.</p>
              </div>
            )}
          </CardContent>
        </Card>
      ),
    }] : []),
    ...((canReadDocuments || canCreateDocuments) ? [{
      id: 'documents',
      label: 'Документы',
      content: (
        <ProjectWorkspaceSection
          project={{ id: project.id, code: project.code, name: project.name }}
          documents={projectDocuments}
          activities={[]}
          canCreateDocuments={canCreateDocuments}
          canReadDocuments={canReadDocuments}
          showDocuments
          showActivity={false}
        />
      ),
    }] : []),
    {
      id: 'history',
      label: 'История',
      content: (
        <ProjectWorkspaceSection
          project={{ id: project.id, code: project.code, name: project.name }}
          documents={[]}
          activities={projectActivities.map((activity) => ({
            ...activity,
            createdAt: activity.createdAt.toISOString(),
          }))}
          canCreateDocuments={false}
          canReadDocuments={false}
          showDocuments={false}
          showActivity
        />
      ),
    },
  ]

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/projects">
          <Button variant="ghost" className="pl-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к списку
          </Button>
        </Link>
      </div>

      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold sm:text-3xl">{project.name}</h1>
            <Badge variant={project.status === 'ACTIVE' ? 'default' : 'secondary'}>
              {ProjectStatusLabels[project.status]}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">{project.code}</p>
        </div>
        {canEditProject && (
          <Link href={`/projects/${project.id}/edit`}>
            <Button variant="outline"><Edit className="mr-2 h-4 w-4" />Редактировать</Button>
          </Link>
        )}
      </div>

      <ProjectDetailTabs tabs={projectTabs} />
    </main>
  )
}
