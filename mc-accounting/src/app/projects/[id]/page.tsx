import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Edit, Calendar, Wallet, FolderKanban, Target, CheckSquare, Trophy, Plus } from 'lucide-react'
import { ProjectStatusLabels } from '@/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ProjectGantt } from './gantt-client'

interface ProjectPageProps {
  params: { id: string }
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      tasksList: {
        orderBy: { createdAt: 'asc' },
      },
      assets: {
        include: {
          mol: true,
          group: true,
        },
      },
      _count: {
        select: { assets: true, tasksList: true }
      }
    }
  })

  if (!project) {
    notFound()
  }

  // Calculate budget remaining
  const remainingBudget = Number(project.plannedBudget) - Number(project.actualBudget)

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

      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <Badge 
              variant={project.status === 'ACTIVE' ? 'default' : 'secondary'}
            >
              {ProjectStatusLabels[project.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground">{project.code}</p>
        </div>
        <Link href={`/projects/${project.id}/edit`}>
          <Button variant="outline">
            <Edit className="mr-2 h-4 w-4" />
            Редактировать
          </Button>
        </Link>
      </div>

      {/* Main layout: Gantt left, Info right */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left side - Gantt Chart with task table */}
        <div className="xl:col-span-3 min-h-[700px]">
          <ProjectGantt 
            projectId={project.id}
            tasks={(project.tasksList || []) as any}
          />
        </div>

        {/* Right side - Project info */}
        <div className="space-y-6">
          {/* Description Block */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FolderKanban className="h-4 w-4" />
                Описание проекта
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.description || 'Нет описания'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4" />
                Цели проекта
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.goals || 'Нет целей'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckSquare className="h-4 w-4" />
                Задачи проекта
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.tasks || 'Нет задач'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Результаты проекта
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.results || 'Нет результатов'}</p>
            </CardContent>
          </Card>

          {/* Budget Block */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Бюджет проекта
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Структура цены:</span>
                <span className="text-sm font-medium">{project._count.assets} активов</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Плановый бюджет:</span>
                <span className="text-sm font-medium">{formatCurrency(Number(project.plannedBudget))}</span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Фактический бюджет:</span>
                <span className="text-sm font-medium">{formatCurrency(Number(project.actualBudget))}</span>
              </div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">Остатки бюджета:</span>
                <span className={`text-sm font-medium ${remainingBudget < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(remainingBudget)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Timeline Block */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Сроки проекта
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Дата начала:</span>
                <span className="text-sm font-medium">
                  {project.startDate ? formatDate(project.startDate) : '—'}
                </span>
              </div>
              
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Дата окончания:</span>
                <span className="text-sm font-medium">
                  {project.endDate ? formatDate(project.endDate) : '—'}
                </span>
              </div>
              
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">Продолжительность:</span>
                <span className="text-sm font-medium">
                  {project.startDate && project.endDate 
                    ? `${Math.ceil((new Date(project.endDate).getTime() - new Date(project.startDate).getTime()) / (1000 * 60 * 60 * 24))} дней`
                    : '—'
                  }
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
