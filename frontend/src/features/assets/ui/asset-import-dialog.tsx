'use client'

import { useState, type ChangeEvent } from 'react'
import { AlertCircle, Check, Download, LoaderCircle, Upload } from 'lucide-react'
import type { AssetImportPreviewRow } from '../contracts/asset-import'
import { Badge } from '@/components/ui/badge'
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
import { useToast } from '@/components/ui/toast'

interface PreviewResult {
  rows: AssetImportPreviewRow[]
  validCount: number
  errorCount: number
}

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error?.message || 'Не удалось выполнить импорт')
  return body?.data as T
}

function assetWord(count: number) {
  const lastTwo = count % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'объектов'
  const last = count % 10
  if (last === 1) return 'объект'
  if (last >= 2 && last <= 4) return 'объекта'
  return 'объектов'
}

export function AssetImportDialog({ onImported }: { onImported: () => void }) {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [importing, setImporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const canImport = Boolean(preview && preview.rows.length > 0 && preview.errorCount === 0 &&
    preview.rows.every((row) => row.input))

  const clear = () => {
    setFile(null)
    setPreview(null)
    setMessage(null)
  }

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen && !checking && !importing) clear()
  }

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] || null)
    setPreview(null)
    setMessage(null)
  }

  const checkFile = async () => {
    if (!file) return
    setChecking(true)
    setMessage(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const result = await responseData<PreviewResult>(await fetch('/api/assets/import/preview', {
        method: 'POST',
        body: form,
      }))
      setPreview(result)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось проверить файл')
    } finally {
      setChecking(false)
    }
  }

  const commit = async () => {
    if (!canImport || !preview) return
    setImporting(true)
    setMessage(null)
    try {
      const assets = preview.rows.flatMap((row) => row.input ? [row.input] : [])
      const result = await responseData<{ importedCount: number }>(await fetch('/api/assets/import/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assets }),
      }))
      toast.success(`Добавлено объектов: ${result.importedCount}`)
      clear()
      setOpen(false)
      onImported()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось сохранить имущество')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="mr-2 h-4 w-4" />Импорт Excel</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Импорт имущества из Excel</DialogTitle>
          <DialogDescription>
            Загрузите заполненный шаблон. Система проверит номера, каталоги и права доступа до создания записей.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-medium" htmlFor="asset-import-file">
            Файл .xlsx
            <input
              id="asset-import-file"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={chooseFile}
            />
            <span className="text-xs font-normal text-muted-foreground">
              {file ? `${file.name} · ${(file.size / 1024).toFixed(0)} КБ` : 'До 100 объектов за один импорт'}
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" asChild>
              <a href="/api/assets/import/template" download>
                <Download className="mr-2 h-4 w-4" />Скачать шаблон
              </a>
            </Button>
            <Button type="button" onClick={checkFile} disabled={!file || checking || importing}>
              {checking ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {checking ? 'Проверяем…' : 'Проверить файл'}
            </Button>
          </div>
        </div>

        {message && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {preview && (
          <section aria-label="Предварительный просмотр" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Badge variant={preview.errorCount === 0 ? 'success' : 'destructive'}>
                  {preview.errorCount === 0 ? `Готово к импорту: ${preview.validCount}` : `Ошибок: ${preview.errorCount}`}
                </Badge>
                {preview.errorCount > 0 && <Badge variant="outline">Исправьте файл и загрузите снова</Badge>}
              </div>
              <span className="text-xs text-muted-foreground">Всего строк: {preview.rows.length}</span>
            </div>

            <div className="max-h-[42vh] overflow-auto rounded-md border">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Строка</th>
                    <th className="px-3 py-2">Инвентарный номер</th>
                    <th className="px-3 py-2">Наименование</th>
                    <th className="px-3 py-2">МОЛ / группа</th>
                    <th className="px-3 py-2">Количество</th>
                    <th className="px-3 py-2">Цена</th>
                    <th className="px-3 py-2">Проверка</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.inventoryNumber}`} className="border-t align-top">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                      <td className="px-3 py-2 font-medium">{row.inventoryNumber || '—'}</td>
                      <td className="max-w-xs px-3 py-2">{row.name || '—'}</td>
                      <td className="px-3 py-2">
                        <div>МОЛ: {row.molCode || '—'}</div>
                        <div className="text-xs text-muted-foreground">Группа: {row.groupCode || '—'}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{row.quantity || '—'} {row.unitOfMeasure}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.unitPrice || '—'}</td>
                      <td className="min-w-72 px-3 py-2">
                        {row.errors.length ? (
                          <ul className="list-disc space-y-1 pl-4 text-destructive">
                            {row.errors.map((error) => <li key={error}>{error}</li>)}
                          </ul>
                        ) : <span className="text-emerald-700">Готово к созданию</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={checking || importing}>
            Закрыть
          </Button>
          <Button type="button" onClick={commit} disabled={!canImport || checking || importing}>
            {importing && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            {importing ? 'Сохраняем…' : `Создать ${preview?.validCount || 0} ${assetWord(preview?.validCount || 0)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
