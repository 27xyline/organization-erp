'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft } from 'lucide-react'

export default function NewProjectPage() {
  const router = useRouter()
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          plannedBudget: parseFloat(formData.plannedBudget) || 0,
        }),
      })

      if (response.ok) {
        router.push('/projects')
        router.refresh()
      } else {
        alert('Ошибка при создании проекта')
      }
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Ошибка при создании проекта')
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

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Новый проект</CardTitle>
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
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Описание проекта"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="goals">Цели проекта</Label>
              <Textarea
                id="goals"
                value={formData.goals}
                onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
                placeholder="Цели проекта"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tasks">Задачи проекта</Label>
              <Textarea
                id="tasks"
                value={formData.tasks}
                onChange={(e) => setFormData({ ...formData, tasks: e.target.value })}
                placeholder="Задачи проекта"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="results">Результаты проекта</Label>
              <Textarea
                id="results"
                value={formData.results}
                onChange={(e) => setFormData({ ...formData, results: e.target.value })}
                placeholder="Ожидаемые результаты"
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

            <div className="space-y-2">
              <Label htmlFor="plannedBudget">Плановый бюджет (₽)</Label>
              <Input
                id="plannedBudget"
                type="number"
                value={formData.plannedBudget}
                onChange={(e) => setFormData({ ...formData, plannedBudget: e.target.value })}
                placeholder="0"
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'Создание...' : 'Создать проект'}
              </Button>
              <Link href="/projects">
                <Button variant="outline" type="button">Отмена</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
