'use client'

import dynamic from 'next/dynamic'
import type { Task } from '@/types'

const ProjectGantt = dynamic(
  () => import('./gantt-client').then((module) => module.ProjectGantt),
  {
    ssr: false,
    loading: () => <div className="h-[700px] animate-pulse rounded-xl bg-muted/50" />,
  },
)

export function LazyProjectGantt({ projectId, tasks }: { projectId: string; tasks: Task[] }) {
  return <ProjectGantt projectId={projectId} tasks={tasks} />
}
