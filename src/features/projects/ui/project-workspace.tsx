'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Activity, Download, FileText, FolderOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentView,
} from '@/features/documents/contracts/ui-types'

interface ProjectActivity {
  id: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  user: { id: string; name: string; username: string } | null
}

const actionLabels: Record<string, string> = {
  PROJECT_CREATE: 'создал проект',
  PROJECT_UPDATE: 'обновил проект',
  TASK_CREATE: 'создал задачу',
  TASK_UPDATE: 'обновил задачу',
  TASK_COMMENT: 'добавил комментарий к задаче',
  TASK_DELETE: 'удалил задачу',
  DOCUMENT_CREATE: 'загрузил документ',
  DOCUMENT_VERSION_CREATE: 'добавил версию документа',
  DOCUMENT_STATUS_UPDATE: 'изменил статус документа',
  DOCUMENT_ARCHIVE: 'архивировал документ',
}

export function ProjectWorkspace({
  project,
  documents,
  activities,
  uploadAction,
}: {
  project: { id: string; code: string; name: string }
  documents: DocumentView[]
  activities: ProjectActivity[]
  uploadAction?: ReactNode
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-slate-50/80">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-4 w-4" />
              Документы проекта
            </CardTitle>
            <CardDescription>Файлы, версии и статусы согласования.</CardDescription>
          </div>
          {uploadAction}
        </CardHeader>
        <CardContent className="space-y-3 p-6">
          {documents.map((document) => (
            <div key={document.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Link href={`/documents/${document.id}`} className="font-medium hover:underline">
                  {document.title}
                </Link>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="outline">{DOCUMENT_CATEGORY_LABELS[document.category]}</Badge>
                  <Badge variant="secondary">{DOCUMENT_STATUS_LABELS[document.status]}</Badge>
                  <span className="text-xs text-muted-foreground">Версия {document.currentVersion}</span>
                </div>
              </div>
              <Button asChild variant="ghost" size="icon" aria-label={`Скачать ${document.title}`}>
                <a href={`/api/documents/${document.id}/download`}><Download className="h-4 w-4" /></a>
              </Button>
            </div>
          ))}
          {!documents.length && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <FileText className="mx-auto mb-3 h-8 w-8" />
              Документов проекта пока нет
            </div>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link href={`/documents?projectId=${project.id}`}>Открыть все документы</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-slate-50/80">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Лента изменений
          </CardTitle>
          <CardDescription>Последние действия по проекту, задачам и документам.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="flex gap-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div>
                  <p className="text-sm">
                    <span className="font-medium">{activity.user?.name || activity.user?.username || 'Система'}</span>{' '}
                    {actionLabels[activity.action] || 'изменил данные проекта'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(activity.createdAt).toLocaleString('ru-RU')}
                  </p>
                </div>
              </div>
            ))}
            {!activities.length && <p className="py-8 text-center text-sm text-muted-foreground">История пока пуста</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
