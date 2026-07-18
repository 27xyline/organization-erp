'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Archive,
  Download,
  FileSearch,
  FileText,
  Loader2,
  Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_STATUS_LABELS,
  type DocumentCategoryValue,
  type DocumentStatusValue,
  type DocumentView,
} from '../contracts/ui-types'
import { DocumentUploadDialog } from './document-upload-dialog'

interface DocumentsPageClientProps {
  documents: DocumentView[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  filters: {
    search?: string
    status?: DocumentStatusValue
    category?: DocumentCategoryValue
    archived: boolean
  }
  canEdit: boolean
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

export function DocumentsPageClient({
  documents,
  pagination,
  filters,
  canEdit,
}: DocumentsPageClientProps) {
  const router = useRouter()
  const [isNavigating, startTransition] = useTransition()
  const [search, setSearch] = useState(filters.search || '')
  const [status, setStatus] = useState(filters.status || '')
  const [category, setCategory] = useState(filters.category || '')
  const [archived, setArchived] = useState(filters.archived)

  function navigate(page = 1) {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (status) params.set('status', status)
    if (category) params.set('category', category)
    if (archived) params.set('archived', 'true')
    if (page > 1) params.set('page', String(page))
    const query = params.toString()
    startTransition(() => router.push(query ? `/documents?${query}` : '/documents'))
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault()
    navigate()
  }

  function resetFilters() {
    setSearch('')
    setStatus('')
    setCategory('')
    setArchived(false)
    startTransition(() => router.push('/documents'))
  }

  return (
    <main className="container mx-auto space-y-6 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Документы</h1>
          <p className="mt-1 text-muted-foreground">
            Версии, согласование и защищённое локальное хранение файлов.
          </p>
        </div>
        {canEdit && <DocumentUploadDialog onUploaded={() => router.refresh()} />}
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_200px_200px_auto_auto]" onSubmit={applyFilters}>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Поиск документов"
                className="pl-9"
                placeholder="Название, описание или файл"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              aria-label="Категория документа"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={category}
              onChange={(event) => setCategory(event.target.value as DocumentCategoryValue | '')}
            >
              <option value="">Все категории</option>
              {(Object.entries(DOCUMENT_CATEGORY_LABELS) as Array<[DocumentCategoryValue, string]>)
                .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select
              aria-label="Статус документа"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              value={status}
              disabled={archived}
              onChange={(event) => setStatus(event.target.value as DocumentStatusValue | '')}
            >
              <option value="">Все статусы</option>
              {(Object.entries(DOCUMENT_STATUS_LABELS) as Array<[DocumentStatusValue, string]>)
                .filter(([value]) => value !== 'ARCHIVED')
                .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
              <input
                type="checkbox"
                checked={archived}
                onChange={(event) => {
                  setArchived(event.target.checked)
                  if (event.target.checked) setStatus('')
                }}
              />
              <Archive className="h-4 w-4" />
              Архив
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isNavigating}>
                {isNavigating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSearch className="mr-2 h-4 w-4" />}
                Найти
              </Button>
              <Button type="button" variant="outline" onClick={resetFilters} disabled={isNavigating}>
                Сбросить
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">
              {filters.search || filters.status || filters.category || filters.archived
                ? 'По заданным условиям ничего не найдено'
                : 'Документов пока нет'}
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {canEdit
                ? 'Загрузите первый файл — система создаст документ и неизменяемую версию № 1.'
                : 'Документы появятся здесь после загрузки пользователем с правами редактирования.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Документ</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Привязка</TableHead>
                  <TableHead>Текущая версия</TableHead>
                  <TableHead>Обновлён</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => {
                  const currentFile = document.versions[0]
                  const link = document.project
                    ? `${document.project.code} · ${document.project.name}`
                    : document.employee
                      ? document.employee.fullName
                      : document.asset
                        ? `${document.asset.inventoryNumber} · ${document.asset.name}`
                        : 'Без привязки'
                  return (
                    <TableRow key={document.id}>
                      <TableCell className="min-w-[240px]">
                        <Link href={`/documents/${document.id}`} className="font-medium hover:underline">
                          {document.title}
                        </Link>
                        {document.description && (
                          <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">
                            {document.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{DOCUMENT_CATEGORY_LABELS[document.category]}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(document.status)}>
                          {DOCUMENT_STATUS_LABELS[document.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                        {link}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">№ {document.currentVersion}</p>
                        {currentFile && (
                          <p className="max-w-[220px] truncate text-xs text-muted-foreground">
                            {currentFile.originalFilename} · {formatBytes(currentFile.sizeBytes)}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {dateFormatter.format(new Date(document.updatedAt))}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/documents/${document.id}`}>Открыть</Link>
                          </Button>
                          <Button asChild size="icon" variant="ghost">
                            <a
                              href={`/api/documents/${document.id}/download`}
                              aria-label={`Скачать ${document.title}`}
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {pagination.total > 0 && (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            Показано {documents.length} из {pagination.total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || isNavigating}
              onClick={() => navigate(pagination.page - 1)}
            >
              Назад
            </Button>
            <span>Страница {pagination.page} из {pagination.totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages || isNavigating}
              onClick={() => navigate(pagination.page + 1)}
            >
              Далее
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}

