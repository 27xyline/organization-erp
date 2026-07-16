'use client'

import { useState, useCallback } from 'react'
import { Task } from '@/types'
import { TaskTree } from '@/components/task-tree'

interface ProjectDetailClientProps {
  projectId: string
  initialTasks: Task[]
  view: 'tree' | 'tasks'
}

export function ProjectDetailClient({ projectId, initialTasks, view }: ProjectDetailClientProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)

  const refreshTasks = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`)
      if (response.ok) {
        const data = await response.json()
        setTasks(data)
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    }
  }, [projectId])

  if (view === 'tasks') {
    // Simple list view for sidebar
    return (
      <div className="space-y-1">
        {tasks
          .filter(t => t.level === 1)
          .map(task => (
            <div 
              key={task.id} 
              className="flex items-center gap-2 py-1 px-2 text-sm hover:bg-muted/50 rounded"
            >
              <span className="truncate flex-1">{task.name}</span>
              {task.progress > 0 && (
                <span className="text-xs text-muted-foreground">{task.progress}%</span>
              )}
            </div>
          ))}
      </div>
    )
  }

  // Tree view for tasks tab
  return (
    <TaskTree 
      tasks={tasks} 
      projectId={projectId} 
      onTaskAdded={refreshTasks}
    />
  )
}
