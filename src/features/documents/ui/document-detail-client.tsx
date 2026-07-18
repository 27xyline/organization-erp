'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArrowLeft,
  Download,
  FileCheck2,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentStatusValue,
  type DocumentView,
} from '../contracts/ui-types'
import { DocumentVersionDialog } from './document-version-dialog'
import { responseErrorMessage } from './upload-request'

const TRANSITIONS: Record<DocumentStatusValue, DocumentStatusValue[]> = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['DRAFT', 'APPROVED'],
  APPROVED: ['IN_REVIEW', 'SIGNED'],
  SIGNED: [],
  ARCHIVED: [],
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatBytes(raw: string): string {
  const bytes = Number(raw)
  if (!Number.isFinite(bytes)) return '—'
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`
}

function statusVariant(status: DocumentStatusValue) {
  if (status === 'SIGNED' || status === 'APPROVED') return 'default' as const
  if (status === 'ARCHIVED') return 'outline' as const
  return 'secondary' as const
}

export function DocumentDetailClient({
  document,
  canEdit,
}: {
  document: DocumentView
  canEdit: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const allowedTransitions = TRANSITIONS[document.status]
  const [nextStatus, setNextStatus] = useState<DocumentStatusValue | ''>(
    allowedTransitions[0] || '',
  )
  const [pendingAction, setPendingAction] = useState<'status' | 'archive' | null>(null)

  useEffect(() => {
    setNextStatus(TRANSITIONS[document.status][0] || '')
  }, [document.status])

  async function changeStatus() {
    if (!nextStatus) return
    setPendingAction('status')
    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          lockVersion: document.lockVersion,
        }),
      })
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, 'Не удалось изменить статус'))
      }
      toast.success('Статус документа изменён')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось изменить статус')
    } finally {
      setPendingAction(null)
    }
  }

  async function archiveDocument() {
    if (!window.confirm('Переместить документ в архив? Версии останутся доступны для чтения.')) {
      return
    }
    setPendingAction('archive')
    try {
      const response = await fetch(`/api/documents/${document.id}/archive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lockVersion: document.lockVersion }),
      })
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, 'Не удалось архивировать документ'))
      }
      toast.success('Документ перемещён в архив')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось архивировать документ')
    } finally {
      setPendingAction(null)
    }
  }

  const relatedItems = [
    document.project && {
      label: 'Проект',
      value: `${document.project.code} · ${document.project.name}`,
      href: `/projects/${document.project.id}`,
    },
    document.employee && {
      label: 'Сотрудник',
      value: `${document.employee.code} · ${document.employee.fullName}`,
    },
    document.asset && {
      label: 'Имущество',
      value: `${document.asset.inventoryNumber} · ${document.asset.name}`,
      href: `/assets/${document.asset.id}`,
    },
  ].filter(Boolean) as Array<{ label: string; value: string; href?: string }>

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <Button asChild variant="ghost" className="pl-0">
        <Link href="/documents">
          <ArrowLeft className="mr-2 h-4 w-4" />
          К документам
        </Link>
      </Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(document.status)}>
              {DOCUMENT_STATUS_LABELS[document.status]}
            </Badge>
            <Badge variant="outline">{DOCUMENT_CATEGORY_LABELS[document.category]}</Badge>
            <span className="text-sm text-muted-foreground">
              Текущая версия № {document.currentVersion}
            </span>
          </div>
          <h1 className="break-words text-3xl font-bold">{document.title}</h1>
          {document.description && (
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-muted-foreground">
              {document.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={`/api/documents/${document.id}/download`}>
              <Download className="mr-2 h-4 w-4" />
              Скачать текущую
            </a>
          </Button>
          {canEdit && document.status !== 'ARCHIVED' && (
            <DocumentVersionDialog
              documentId={document.id}
              lockVersion={document.lockVersion}
              onUploaded={() => router.refresh()}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Карточка документа</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Создал</p>
              <p className="font-medium">{document.createdBy.name}</p>
              <p className="text-xs text-muted-foreground">@{document.createdBy.username}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Создан</p>
              <p className="font-medium">{dateFormatter.format(new Date(document.createdAt))}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Последнее изменение</p>
              <p className="font-medium">{dateFormatter.format(new Date(document.updatedAt))}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Целостность</p>
              <p className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                SHA-256 для каждой версии
              </p>
            </div>
            {relatedItems.length > 0 ? relatedItems.map((item) => (
              <div key={item.label} className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                {item.href ? (
                  <Link href={item.href} className="font-medium hover:underline">{item.value}</Link>
                ) : (
                  <p className="font-medium">{item.value}</p>
                )}
              </div>
            )) : (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">Привязка</p>
                <p className="font-medium">Без привязки к объектам системы</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Жизненный цикл</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {document.status === 'ARCHIVED' ? (
              <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <Archive className="h-4 w-4" /> Документ в архиве
                </p>
                {document.archivedAt && (
                  <p className="mt-1 text-muted-foreground">
                    {dateFormatter.format(new Date(document.archivedAt))}
                  </p>
                )}
              </div>
            ) : canEdit ? (
              <>
                {allowedTransitions.length > 0 && (
                  <div className="grid gap-2">
                    <label htmlFor="document-next-status" className="text-sm font-medium">
                      Следующий статус
                    </label>
                    <select
                      id="document-next-status"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={nextStatus}
                      onChange={(event) => setNextStatus(event.target.value as DocumentStatusValue)}
                    >
                      {allowedTransitions.map((status) => (
                        <option key={status} value={status}>
                          {DOCUMENT_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                    <Button onClick={changeStatus} disabled={!nextStatus || pendingAction !== null}>
                      {pendingAction === 'status'
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <FileCheck2 className="mr-2 h-4 w-4" />}
                      Изменить статус
                    </Button>
                  </div>
                )}
                {allowedTransitions.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Документ подписан. Доступно только архивирование.
                  </p>
                )}
                <Button
                  variant="outline"
                  className="w-full text-destructive"
                  disabled={pendingAction !== null}
                  onClick={archiveDocument}
                >
                  {pendingAction === 'archive'
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Archive className="mr-2 h-4 w-4" />}
                  В архив
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Для изменения статуса нужны права редактора.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>История версий</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Версия</TableHead>
                <TableHead>Файл</TableHead>
                <TableHead>Размер</TableHead>
                <TableHead>Загрузил</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Комментарий</TableHead>
                <TableHead>SHA-256</TableHead>
                <TableHead className="text-right">Скачать</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {document.versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell className="font-medium">
                    № {version.versionNumber}
                    {version.versionNumber === document.currentVersion && (
                      <Badge className="ml-2" variant="secondary">текущая</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate">
                    {version.originalFilename}
                  </TableCell>
                  <TableCell>{formatBytes(version.sizeBytes)}</TableCell>
                  <TableCell>{version.uploadedBy.name}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {dateFormatter.format(new Date(version.createdAt))}
                  </TableCell>
                  <TableCell className="max-w-[260px] whitespace-pre-wrap text-sm text-muted-foreground">
                    {version.comment || '—'}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs" title={version.sha256}>
                      {version.sha256.slice(0, 12)}…
                    </code>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="icon">
                      <a
                        href={`/api/documents/${document.id}/download?version=${version.versionNumber}`}
                        aria-label={`Скачать версию ${version.versionNumber}`}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  )
}

