import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Edit, Calendar, Wallet, FolderKanban, Target, CheckSquare, Trophy } from 'lucide-react'
import { ProjectStatusLabels, ProjectStatus } from '@/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { SvarGanttChart } from '@/components/svar-gantt-chart'
import { TaskTree } from '@/components/task-tree'
import { ProjectDetailClient } from './client'

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

      <Tabs defaultValue="gantt" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
          <TabsTrigger value="gantt">Гантт</TabsTrigger>
          <TabsTrigger value="info">Информация</TabsTrigger>
          <TabsTrigger value="tasks">Задачи</TabsTrigger>
          <TabsTrigger value="budget">Бюджет</TabsTrigger>
        </TabsList>

        {/* Gantt Chart Tab */}
        <TabsContent value="gantt">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left sidebar - Task list */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" />
                  Задачи ({project._count.tasksList})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-[500px] overflow-auto">
                <ProjectDetailClient 
                  projectId={project.id} 
                  initialTasks={(project.tasksList ?? []) as any}
                  view="tasks"
                />
              </CardContent>
            </Card>

            {/* Main area - Gantt Chart */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-sm">Диаграмма Ганта</CardTitle>
              </CardHeader>
              <CardContent>
                <SvarGanttChart 
                  tasks={(project.tasksList || []) as any}
                  projectStart={project.startDate || undefined}
                  projectEnd={project.endDate || undefined}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Info Tab */}
        <TabsContent value="info">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column - Description blocks */}
            <div className="space-y-6">
              {project.description && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FolderKanban className="h-4 w-4" />
                      Описание проекта
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{project.description}</p>
                  </CardContent>
                </Card>
              )}

              {project.goals && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Цели проекта
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{project.goals}</p>
                  </CardContent>
                </Card>
              )}

              {project.tasks && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckSquare className="h-4 w-4" />
                      Задачи проекта
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{project.tasks}</p>
                  </CardContent>
                </Card>
              )}

              {project.results && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      Результаты проекта
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{project.results}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right column - Budget info */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Бюджет проекта
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Структура цены:</span>
                    <span className="font-medium">{project._count.assets} активов</span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Плановый бюджет:</span>
                    <span className="font-medium text-lg">
                      {formatCurrency(Number(project.plannedBudget))}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Фактический бюджет:</span>
                    <span className="font-medium text-lg">
                      {formatCurrency(Number(project.actualBudget))}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Остатки бюджета:</span>
                    <span className={`font-medium text-lg ${remainingBudget < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(remainingBudget)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Сроки проекта
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Дата начала:</span>
                    <span className="font-medium">
                      {project.startDate ? formatDate(project.startDate) : '—'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-muted-foreground">Дата окончания:</span>
                    <span className="font-medium">
                      {project.endDate ? formatDate(project.endDate) : '—'}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Продолжительность:</span>
                    <span className="font-medium">
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
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle>Структура задач (3 уровня)</CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectDetailClient 
                projectId={project.id} 
                initialTasks={(project.tasksList ?? []) as any}
                view="tree"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Budget Tab */}
        <TabsContent value="budget">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Активы проекта ({project._count.assets})</CardTitle>
              </CardHeader>
              <CardContent>
                {project.assets.length === 0 ? (
                  <p className="text-muted-foreground">Нет привязанных активов</p>
                ) : (
                  <div className="space-y-3">
                    {project.assets.map((asset) => (
                      <div key={asset.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{asset.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {asset.inventoryNumber} | {asset.group.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(Number(asset.totalCost))}</p>
                          <p className="text-sm text-muted-foreground">{asset.mol.fullName}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Сводка по бюджету</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Плановый бюджет:</span>
                    <span className="font-medium">{formatCurrency(Number(project.plannedBudget))}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ 
                        width: `${Math.min((Number(project.actualBudget) / Number(project.plannedBudget)) * 100, 100)}%` 
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-1">План</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {formatCurrency(Number(project.plannedBudget))}
                    </p>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-1">Факт</p>
                    <p className="text-2xl font-bold text-orange-700">
                      {formatCurrency(Number(project.actualBudget))}
                    </p>
                  </div>
                </div>

                <div className={`p-4 rounded-lg text-center ${remainingBudget < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                  <p className="text-sm text-muted-foreground mb-1">Остаток</p>
                  <p className={`text-2xl font-bold ${remainingBudget < 0 ? 'text-red-700' : 'text-green-700'}`}>
                    {formatCurrency(remainingBudget)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  )
}
