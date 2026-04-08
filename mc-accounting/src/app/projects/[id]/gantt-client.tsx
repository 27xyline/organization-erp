'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { CustomGantt } from '@/components/custom-gantt'
import { Task } from '@/types'
import { Button } from '@/components/ui/button'
import { Plus, Edit, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ProjectGanttProps {
  projectId: string
  tasks: Task[]
}

export function ProjectGantt({ projectId, tasks }: ProjectGanttProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  const handleTaskEdit = async (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      setEditingTask(task)
      setIsEditDialogOpen(true)
    }
  }

  const handleTaskDelete = async (taskId: string) => {
    if (!confirm('Удалить задачу?')) return
    
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        router.refresh()
      } else {
        toast.error('Ошибка при удалении задачи')
      }
    } catch (error) {
      console.error('Error deleting task:', error)
      toast.error('Ошибка при удалении задачи')
    }
  }

  const [parentTaskId, setParentTaskId] = useState<string | undefined>(undefined)

  const handleTaskAdd = async (parentId?: string) => {
    setParentTaskId(parentId)
    setIsAddDialogOpen(true)
  }

  const handleSaveTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!editingTask) return
    
    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get('name'),
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
      responsible: formData.get('responsible'),
      status: formData.get('status'),
      progress: Number(formData.get('progress')),
    }
    
    try {
      const response = await fetch(`/api/tasks/${editingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      
      if (response.ok) {
        setIsEditDialogOpen(false)
        setEditingTask(null)
        router.refresh()
      } else {
        toast.error('Ошибка при сохранении задачи')
      }
    } catch (error) {
      console.error('Error saving task:', error)
      toast.error('Ошибка при сохранении задачи')
    }
  }

  const handleCreateTask = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    const formData = new FormData(e.currentTarget)
    
    // Определяем уровень задачи
    let level = 1
    if (parentTaskId) {
      const parentTask = tasks.find(t => t.id === parentTaskId)
      if (parentTask) {
        level = parentTask.level + 1
      }
    }
    
    const data = {
      name: formData.get('name'),
      startDate: formData.get('startDate'),
      endDate: formData.get('endDate'),
      responsible: formData.get('responsible'),
      status: formData.get('status'),
      progress: 0,
      projectId: projectId,
      parentId: parentTaskId || null,
      level: level,
    }
    
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      
      if (response.ok) {
        setIsAddDialogOpen(false)
        setParentTaskId(undefined)
        router.refresh()
      } else {
        toast.error('Ошибка при создании задачи')
      }
    } catch (error) {
      console.error('Error creating task:', error)
      toast.error('Ошибка при создании задачи')
    }
  }

  return (
    <>
      <CustomGantt 
        tasks={tasks}
        projectId={projectId}
        onTaskEdit={handleTaskEdit}
        onTaskDelete={handleTaskDelete}
        onTaskAdd={handleTaskAdd}
      />
      
      {/* Диалог редактирования */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать задачу</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Название</Label>
                <Input id="edit-name" name="name" defaultValue={editingTask.name} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-start">Начало</Label>
                  <Input 
                    id="edit-start" 
                    name="startDate" 
                    type="date" 
                    defaultValue={editingTask.startDate ? new Date(editingTask.startDate).toISOString().split('T')[0] : ''} 
                  />
                </div>
                <div>
                  <Label htmlFor="edit-end">Конец</Label>
                  <Input 
                    id="edit-end" 
                    name="endDate" 
                    type="date" 
                    defaultValue={editingTask.endDate ? new Date(editingTask.endDate).toISOString().split('T')[0] : ''} 
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-responsible">Исполнитель</Label>
                <Textarea
                  id="edit-responsible"
                  name="responsible"
                  defaultValue={editingTask.responsible || ''}
                  placeholder="Один исполнитель на строку"
                  rows={4}
                />
              </div>
              <div>
                <Label htmlFor="edit-status">Статус</Label>
                <Select name="status" defaultValue={editingTask.status}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NOT_STARTED">Не начата</SelectItem>
                    <SelectItem value="IN_PROGRESS">В работе</SelectItem>
                    <SelectItem value="COMPLETED">Завершена</SelectItem>
                    <SelectItem value="DELAYED">Просрочена</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-progress">Прогресс (%)</Label>
                <Input 
                  id="edit-progress" 
                  name="progress" 
                  type="number" 
                  min="0" 
                  max="100" 
                  defaultValue={editingTask.progress} 
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit">Сохранить</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Диалог добавления */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
        setIsAddDialogOpen(open)
        if (!open) setParentTaskId(undefined)
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {parentTaskId ? 'Добавить подзадачу' : 'Добавить задачу'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div>
              <Label htmlFor="add-name">Название</Label>
              <Input id="add-name" name="name" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="add-start">Начало</Label>
                <Input id="add-start" name="startDate" type="date" />
              </div>
              <div>
                <Label htmlFor="add-end">Конец</Label>
                <Input id="add-end" name="endDate" type="date" />
              </div>
            </div>
            <div>
              <Label htmlFor="add-responsible">Исполнитель</Label>
              <Textarea
                id="add-responsible"
                name="responsible"
                placeholder="Один исполнитель на строку"
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="add-status">Статус</Label>
              <Select name="status" defaultValue="NOT_STARTED">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOT_STARTED">Не начата</SelectItem>
                  <SelectItem value="IN_PROGRESS">В работе</SelectItem>
                  <SelectItem value="COMPLETED">Завершена</SelectItem>
                  <SelectItem value="DELAYED">Просрочена</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Отмена
              </Button>
              <Button type="submit">Создать</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
