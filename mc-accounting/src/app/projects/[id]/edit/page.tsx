'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'
import { ProjectStatus, ProjectStatusLabels } from '@/types'

interface EditProjectPageProps {
  params: { id: string }
}

export default function EditProjectPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
        }
      } catch (error) {
        console.error('Error fetching project:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchProject()
  }, [params.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await fetch(`/api/projects/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          plannedBudget: parseFloat(formData.plannedBudget) || 0,
          actualBudget: parseFloat(formData.actualBudget) || 0,
        }),
      })

      if (response.ok) {
        router.push(`/projects/${params.id}`)
        router.refresh()
      } else {
        alert('Ошибка при обновлении проекта')
      }
    } catch (error) {
      console.error('Error updating project:', error)
      alert('Ошибка при обновлении проекта')
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

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Редактирование проекта</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Код проекта</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Название проекта</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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

            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goals">Цели проекта</Label>
              <Textarea
                id="goals"
                value={formData.goals}
                onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tasks">Задачи проекта</Label>
              <Textarea
                id="tasks"
                value={formData.tasks}
                onChange={(e) => setFormData({ ...formData, tasks: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="results">Результаты проекта</Label>
              <Textarea
                id="results"
                value={formData.results}
                onChange={(e) => setFormData({ ...formData, results: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plannedBudget">Плановый бюджет (₽)</Label>
                <Input
                  id="plannedBudget"
                  type="number"
                  value={formData.plannedBudget}
                  onChange={(e) => setFormData({ ...formData, plannedBudget: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actualBudget">Фактический бюджет (₽)</Label>
                <Input
                  id="actualBudget"
                  type="number"
                  value={formData.actualBudget}
                  onChange={(e) => setFormData({ ...formData, actualBudget: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить изменения'}
              </Button>
              <Link href={`/projects/${params.id}`}>
                <Button variant="outline" type="button">Отмена</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
