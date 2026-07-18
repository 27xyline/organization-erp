import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Plus, FolderKanban, Calendar, Wallet } from 'lucide-react'
import { ProjectStatusLabels } from '@/features/projects/contracts/types'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import { ProjectService } from '@/features/projects/application/project.service'
import { requirePagePermission } from '@/lib/auth/authorization'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const user = await requirePagePermission('projects.read')
  const result = await ProjectService.list({ page: 1, pageSize: 100 }, user.access)
  const projects = result.projects

  return (
    <main className="container mx-auto py-8 px-4">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Проекты</h1>
          <p className="text-muted-foreground mt-1">
            Управление проектами и задачами
          </p>
        </div>
        {user.access.has('projects.create') && <Button asChild className="shrink-0">
          <Link href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            Новый проект
          </Link>
        </Button>}
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Проекты не созданы.<br />
              Нажмите &quot;Новый проект&quot;, чтобы создать первый проект.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="group">
              <Card className="relative overflow-hidden hover:-translate-y-1 hover:shadow-lg hover:border-slate-350 transition-all duration-300 cursor-pointer h-full pt-1">
                <div 
                  className={cn(
                    "absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r transition-all duration-300",
                    project.status === 'ACTIVE' 
                      ? 'from-blue-500 to-indigo-500' 
                      : 'from-slate-200 to-slate-300'
                  )} 
                />
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg group-hover:text-primary transition-colors">{project.name}</CardTitle>
                    <Badge 
                      variant={project.status === 'ACTIVE' ? 'default' : 'secondary'}
                    >
                      {ProjectStatusLabels[project.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{project.code}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {project.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {project.description}
                    </p>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{project._count.tasksList} задач</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Wallet className="h-4 w-4" />
                      <span>{project._count.assets} активов</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Бюджет:</span>
                      <span className="font-medium">
                        {formatCurrency(Number(project.plannedBudget))}
                      </span>
                    </div>
                    {(project.startDate || project.endDate) && (
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-muted-foreground">Сроки:</span>
                        <span className="font-medium">
                          {project.startDate ? formatDate(project.startDate) : '—'} 
                          {' - '}
                          {project.endDate ? formatDate(project.endDate) : '—'}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
