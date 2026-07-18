'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { DOCUMENT_ACCEPT_ATTRIBUTE } from '../domain/file-policy'
import {
  DOCUMENT_CATEGORY_LABELS,
  type DocumentCategoryValue,
  type DocumentLinkOptions,
} from '../contracts/ui-types'
import {
  encodeDocumentMetadata,
  responseErrorMessage,
} from './upload-request'

const NONE_VALUE = '__none__'

interface DocumentUploadDialogProps {
  onUploaded: () => void
}

export function DocumentUploadDialog({ onUploaded }: DocumentUploadDialogProps) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [optionsLoaded, setOptionsLoaded] = useState(false)
  const [options, setOptions] = useState<DocumentLinkOptions>({
    projects: [],
    employees: [],
    assets: [],
  })
  const [optionsError, setOptionsError] = useState('')

  useEffect(() => {
    if (!open || optionsLoading || optionsLoaded) {
      return
    }
    let cancelled = false
    setOptionsLoading(true)
    setOptionsError('')
    fetch('/api/documents/options', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseErrorMessage(response, 'Не удалось загрузить справочники'))
        return response.json()
      })
      .then((payload: { data: DocumentLinkOptions }) => {
        if (!cancelled) setOptions(payload.data)
      })
      .catch((error: Error) => {
        if (!cancelled) setOptionsError(error.message)
      })
      .finally(() => {
        if (!cancelled) {
          setOptionsLoading(false)
          setOptionsLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, optionsLoaded, optionsLoading])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const file = data.get('file')
    if (!(file instanceof File) || file.size === 0) {
      toast.error('Выберите файл')
      return
    }

    setSubmitting(true)
    try {
      const optionalSelection = (name: string) => {
        const value = String(data.get(name) || '')
        return value && value !== NONE_VALUE ? value : undefined
      }
      const metadata = {
        title: String(data.get('title') || ''),
        description: String(data.get('description') || '') || undefined,
        category: String(data.get('category') || 'GENERAL'),
        projectId: optionalSelection('projectId'),
        employeeId: optionalSelection('employeeId'),
        assetId: optionalSelection('assetId'),
        filename: file.name,
      }
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: {
          'content-type': file.type || 'application/octet-stream',
          'x-document-metadata': encodeDocumentMetadata(metadata),
        },
        body: file,
      })
      if (!response.ok) {
        throw new Error(await responseErrorMessage(response, 'Не удалось загрузить документ'))
      }

      toast.success('Документ загружен')
      form.reset()
      setOpen(false)
      onUploaded()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось загрузить документ')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !submitting && setOpen(value)}>
      <DialogTrigger asChild>
        <Button>
          <FileUp className="mr-2 h-4 w-4" />
          Загрузить документ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новый документ</DialogTitle>
          <DialogDescription>
            Файл сохраняется в защищённом локальном хранилище, вне публичного каталога.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="document-title">Название</Label>
            <Input id="document-title" name="title" maxLength={200} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="document-description">Описание</Label>
            <Textarea id="document-description" name="description" maxLength={2000} rows={3} />
          </div>
          <div className="grid gap-2">
            <Label>Категория</Label>
            <Select name="category" defaultValue="GENERAL">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.entries(DOCUMENT_CATEGORY_LABELS) as Array<[DocumentCategoryValue, string]>)
                  .map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="document-file">Файл</Label>
            <Input
              id="document-file"
              name="file"
              type="file"
              accept={DOCUMENT_ACCEPT_ATTRIBUTE}
              required
            />
            <p className="text-xs text-muted-foreground">
              PDF, Office, CSV, TXT, PNG/JPG или ZIP. Максимальный размер задаётся администратором.
            </p>
          </div>

          {optionsLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Загружаем справочники…
            </p>
          )}
          {optionsError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {optionsError}. Документ можно загрузить без привязки.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid min-w-0 gap-2">
              <Label>Проект</Label>
              <Select name="projectId" defaultValue={NONE_VALUE}>
                <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Без проекта</SelectItem>
                  {options.projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.code} · {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label>Сотрудник</Label>
              <Select name="employeeId" defaultValue={NONE_VALUE}>
                <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Без сотрудника</SelectItem>
                  {options.employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label>Имущество</Label>
              <Select name="assetId" defaultValue={NONE_VALUE}>
                <SelectTrigger><SelectValue placeholder="Не выбрано" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Без имущества</SelectItem>
                  {options.assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.inventoryNumber} · {asset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? 'Загружаем…' : 'Загрузить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
