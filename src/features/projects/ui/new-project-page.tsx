'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, CheckSquare, FolderKanban, Target, Trophy } from 'lucide-react'

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

export default function NewProjectPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
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
  })

  const durationDays = getDurationDays(formData.startDate, formData.endDate)
  const planningPeriods = getPlanningPeriods(formData.startDate, formData.endDate)
  const plannedBudgetValue = Number.parseFloat(formData.plannedBudget) || 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          plannedBudget: plannedBudgetValue,
        }),
      })

      if (response.ok) {
        router.push('/projects')
        router.refresh()
      } else {
        toast.error('Ошибка при создании проекта')
      }
    } catch (error) {
      console.error('Error creating project:', error)
      toast.error('Ошибка при создании проекта')
    } finally {
      setLoading(false)
    }
  }

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

      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold">Новый проект</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Заполни основные данные проекта, чтобы карточка проекта, бюджет и сроки сразу отображались
          в общем списке проектов согласованно.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
                placeholder="Опиши ожидаемый результат проекта"
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

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Длительность</p>
                <p className="mt-2 text-sm font-medium">
                  {durationDays !== null ? `${durationDays} дней` : 'Пока не определена'}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Периоды для выплат</p>
                <p className="mt-2 text-sm font-medium">{planningPeriods.join(', ')}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? 'Создание...' : 'Создать проект'}
              </Button>
              <Link href="/projects">
                <Button variant="outline" type="button">Отмена</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </main>
  )
}
