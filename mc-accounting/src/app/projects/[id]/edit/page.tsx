'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ArrowRightLeft, Calendar, CheckSquare, FolderKanban, Target, Trophy, Wallet } from 'lucide-react'
import { ProjectStatus, ProjectStatusLabels } from '@/types'
import { formatCurrency } from '@/lib/utils'

interface EditProjectPageProps {
  params: { id: string }
}

interface ProjectSummary {
  assetsCount: number
  tasksCount: number
}

const getDurationDays = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) return null

  const start = new Date(startDate)
  const end = new Date(endDate)
  const diff = end.getTime() - start.getTime()

  if (Number.isNaN(diff) || diff < 0) return null

  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

const getPlanningPeriods = (startDate: string, endDate: string) => {
  const formatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
  const start = startDate ? new Date(startDate) : new Date()
  const end = endDate ? new Date(endDate) : new Date(start.getFullYear(), start.getMonth() + 2, 1)
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
}

export default function EditProjectPage({ params }: EditProjectPageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [projectSummary, setProjectSummary] = useState<ProjectSummary>({
    assetsCount: 0,
    tasksCount: 0,
  })
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    goals: '',
    tasks: '',
    results: '',
    startDate: '',
    endDate: '',
    plannedBudget: '',
    actualBudget: '',
    status: 'ACTIVE' as ProjectStatus,
  })

  useEffect(() => {
    async function fetchProject() {
      try {
        const response = await fetch(`/api/projects/${params.id}`)
        if (response.ok) {
          const project = await response.json()
          setFormData({
            code: project.code,
            name: project.name,
            description: project.description || '',
            goals: project.goals || '',
            tasks: project.tasks || '',
            results: project.results || '',
            startDate: project.startDate ? project.startDate.split('T')[0] : '',
            endDate: project.endDate ? project.endDate.split('T')[0] : '',
            plannedBudget: String(project.plannedBudget),
            actualBudget: String(project.actualBudget),
            status: project.status,
          })
          setProjectSummary({
            assetsCount: project._count?.assets ?? project.assets?.length ?? 0,
            tasksCount: project._count?.tasksList ?? project.tasksList?.length ?? 0,
          })
        }
      } catch (error) {
        console.error('Error fetching project:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProject()
  }, [params.id])

  const durationDays = getDurationDays(formData.startDate, formData.endDate)
  const planningPeriods = getPlanningPeriods(formData.startDate, formData.endDate)
  const plannedBudgetValue = Number.parseFloat(formData.plannedBudget) || 0
  const actualBudgetValue = Number.parseFloat(formData.actualBudget) || 0
  const remainingBudget = plannedBudgetValue - actualBudgetValue

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.startDate && formData.endDate && new Date(formData.endDate) < new Date(formData.startDate)) {
      toast.error('Дата окончания не может быть раньше даты начала')
      return
    }

    setSaving(true)

    try {
      const response = await fetch(`/api/projects/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          plannedBudget: plannedBudgetValue,
          actualBudget: actualBudgetValue,
        }),
      })

      if (response.ok) {
        router.push(`/projects/${params.id}`)
        router.refresh()
      } else {
        toast.error('Ошибка при обновлении проекта')
      }
    } catch (error) {
      console.error('Error updating project:', error)
      toast.error('Ошибка при обновлении проекта')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="container mx-auto py-8 px-4">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <Link href={`/projects/${params.id}`}>
          <Button variant="ghost" className="pl-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к проекту
          </Button>
        </Link>
      </div>

      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Редактирование проекта</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Обнови основные данные проекта, чтобы карточка проекта, блок бюджета, сроки и новые нижние разделы
            отображались согласованно.
          </p>
        </div>
        <Badge variant={formData.status === ProjectStatus.ACTIVE ? 'default' : 'secondary'}>
          {ProjectStatusLabels[formData.status]}
        </Badge>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="space-y-6 xl:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FolderKanban className="h-5 w-5" />
                Основное
              </CardTitle>
              <CardDescription>
                Базовые параметры проекта, которые видны в шапке карточки и в общем списке проектов.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code">Код проекта</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="PRJ-001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Название проекта</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Название проекта"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Статус</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as ProjectStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ProjectStatus).map((status) => (
                      <SelectItem key={status} value={status}>
                        {ProjectStatusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Детали проекта</CardTitle>
              <CardDescription>
                Эти поля соответствуют одноименным разделам в карточке проекта: описание, цели, задачи и результаты.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="description" className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4" />
                  Описание проекта
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Коротко опиши суть проекта и его контекст"
                  rows={4}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="goals" className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Цели проекта
                  </Label>
                  <Textarea
                    id="goals"
                    value={formData.goals}
                    onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                    placeholder="Например: сократить сроки, повысить эффективность, подготовить запуск"
                    rows={5}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tasks" className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4" />
                    Задачи проекта
                  </Label>
                  <Textarea
                    id="tasks"
                    value={formData.tasks}
                    onChange={(e) => setFormData({ ...formData, tasks: e.target.value })}
                    placeholder="Укажи ключевые этапы или задачи, которые должны быть видны в карточке"
                    rows={5}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="results" className="flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  Результаты проекта
                </Label>
                <Textarea
                  id="results"
                  value={formData.results}
                  onChange={(e) => setFormData({ ...formData, results: e.target.value })}
                  placeholder="Опиши ожидаемый или уже достигнутый результат проекта"
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Бюджет и сроки</CardTitle>
              <CardDescription>
                Эти значения напрямую влияют на блоки бюджета и сроков, а также на основу таблицы планирования выплат.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Дата начала</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">Дата окончания</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="plannedBudget">Плановый бюджет (₽)</Label>
                  <Input
                    id="plannedBudget"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.plannedBudget}
                    onChange={(e) => setFormData({ ...formData, plannedBudget: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actualBudget">Фактический бюджет (₽)</Label>
                  <Input
                    id="actualBudget"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.actualBudget}
                    onChange={(e) => setFormData({ ...formData, actualBudget: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Длительность</p>
                  <p className="mt-2 text-sm font-medium">
                    {durationDays !== null ? `${durationDays} дней` : 'Пока не определена'}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Остаток бюджета</p>
                  <p className={`mt-2 text-sm font-medium ${remainingBudget < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(remainingBudget)}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Периоды для выплат</p>
                  <p className="mt-2 text-sm font-medium">{planningPeriods.join(', ')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </Button>
            <Link href={`/projects/${params.id}`}>
              <Button variant="outline" type="button">Отмена</Button>
            </Link>
          </div>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Что обновится на странице проекта</CardTitle>
              <CardDescription>
                Краткая сводка по тем блокам, которые уже есть в карточке проекта.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <span className="text-muted-foreground">Код и статус</span>
                <span className="font-medium">{formData.code || '—'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <span className="text-muted-foreground">Задач в Ганте</span>
                <span className="font-medium">{projectSummary.tasksCount}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <span className="text-muted-foreground">Привязано активов</span>
                <span className="font-medium">{projectSummary.assetsCount}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <span className="text-muted-foreground">Остаток бюджета</span>
                <span className={`font-medium ${remainingBudget < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(remainingBudget)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4" />
                Таблица с планированием выплат заработной платы
              </CardTitle>
              <CardDescription>
                Внизу страницы проекта уже добавлен этот блок. Здесь задаются данные, которые формируют его основу.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="font-medium">Что влияет на блок</p>
                <p className="mt-2 text-muted-foreground">
                  Сроки проекта, плановый бюджет и количество задач в диаграмме Ганта.
                </p>
              </div>
              <div className="rounded-lg border px-4 py-3">
                <p className="text-muted-foreground">Текущие периоды</p>
                <p className="mt-1 font-medium">{planningPeriods.join(', ')}</p>
              </div>
              <div className="rounded-lg border px-4 py-3 text-muted-foreground">
                Сами строки выплат пока остаются заготовкой и будут заполняться позже без отдельного файлового блока.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowRightLeft className="h-4 w-4" />
                Журнал поступлений и списаний
              </CardTitle>
              <CardDescription>
                Этот блок в карточке проекта собирается автоматически из операций по привязанным активам.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="font-medium">Источник данных</p>
                <p className="mt-2 text-muted-foreground">
                  Приходы и списания по активам проекта. В этой форме редактируется только сам проект, не движения активов.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-lg border px-4 py-3">
                  <p className="text-muted-foreground">Активов в проекте</p>
                  <p className="mt-1 font-medium">{projectSummary.assetsCount}</p>
                </div>
                <div className="rounded-lg border px-4 py-3">
                  <p className="text-muted-foreground">Чтобы журнал наполнялся</p>
                  <p className="mt-1 font-medium">Добавляй и списывай активы проекта</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" />
                Сроки и контроль
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              После сохранения новые значения сразу отразятся в блоках сроков, бюджета и нижних секциях на странице проекта.
            </CardContent>
          </Card>
        </div>
      </form>
    </main>
  )
}
