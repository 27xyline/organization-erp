'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Archive, Eye, FileSpreadsheet, Filter, RotateCcw, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDecimal } from '@/lib/utils'
import type { Asset, AssetGroup, Mol } from '@/features/assets/contracts/types'

const statusLabels: Record<string, { label: string; color: string }> = {
  IN_STOCK: { label: 'В наличии', color: 'bg-green-100 text-green-800' },
  IN_USE: { label: 'В эксплуатации', color: 'bg-blue-100 text-blue-800' },
  UNDER_REPAIR: { label: 'На ремонте', color: 'bg-yellow-100 text-yellow-800' },
  PLANNED_FOR_DISPOSAL: { label: 'К списанию', color: 'bg-orange-100 text-orange-800' },
  PARTIALLY_DISPOSED: { label: 'Частично списан', color: 'bg-gray-100 text-gray-800' },
  FULLY_DISPOSED: { label: 'Полностью списан', color: 'bg-red-100 text-red-800' },
}

interface ArchiveClientProps {
  assets: Asset[]
  mols: Mol[]
  groups: AssetGroup[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  filters: { search?: string; molId?: string; groupId?: string; status?: string }
  canEdit: boolean
}

export function ArchiveClient({ assets, mols, groups, pagination, filters, canEdit }: ArchiveClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(filters.search || '')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const updateQuery = (changes: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    if (!Object.prototype.hasOwnProperty.call(changes, 'page')) next.delete('page')
    router.push(`${pathname}${next.size ? `?${next.toString()}` : ''}`)
  }

  const handleRestore = async (assetId: string) => {
    if (!confirm('Вы уверены, что хотите восстановить объект из архива?')) return
    setError('')
    const response = await fetch(`/api/assets/${assetId}/restore`, { method: 'POST' })
    if (response.ok) router.refresh()
    else {
      const payload = await response.json()
      setError(payload.error?.message || 'Не удалось восстановить объект')
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await fetch('/api/export?type=assets&archived=true')
      if (!response.ok) throw new Error('export failed')
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `archive_export_${new Date().toISOString().slice(0, 10)}.xlsx`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Не удалось сформировать экспорт')
    } finally {
      setExporting(false)
    }
  }

  const activeFiltersCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold"><Archive className="h-6 w-6" />Архив</h1>
            <p className="mt-1 text-sm text-muted-foreground">Списанные и вручную архивированные объекты</p>
          </div>
          <Button variant="outline" disabled={exporting} onClick={handleExport}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />{exporting ? 'Экспорт...' : 'Экспорт в Excel'}
          </Button>
        </div>
        <form
          className="mt-4 flex max-w-3xl gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            updateQuery({ search })
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по архиву..." />
          </div>
          <Button type="submit" variant="outline">Найти</Button>
          {activeFiltersCount > 0 && (
            <Button type="button" variant="ghost" onClick={() => { setSearch(''); router.push(pathname) }}>
              <X className="mr-2 h-4 w-4" />Сбросить
            </Button>
          )}
        </form>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <Card className="m-4 mr-0 w-72 rounded-lg border-r-0">
          <CardContent className="space-y-4 p-4">
            <p className="flex items-center text-sm font-medium"><Filter className="mr-2 h-4 w-4" />Фильтры</p>
            <ArchiveSelect label="МОЛ" value={filters.molId} placeholder="Все МОЛ" onChange={(value) => updateQuery({ molId: value })} options={mols.map((mol) => ({ value: mol.id, label: `${mol.code} — ${mol.fullName}` }))} />
            <ArchiveSelect label="Группа" value={filters.groupId} placeholder="Все группы" onChange={(value) => updateQuery({ groupId: value })} options={groups.map((group) => ({ value: group.id, label: `${group.code} — ${group.name}` }))} />
            <ArchiveSelect label="Статус" value={filters.status} placeholder="Все статусы" onChange={(value) => updateQuery({ status: value })} options={Object.entries(statusLabels).map(([value, status]) => ({ value, label: status.label }))} />
          </CardContent>
        </Card>

        <div className="flex-1 overflow-auto p-4">
          {error && <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>Показано {assets.length} из {pagination.total}</span>
            <Badge variant="secondary">Всего в архиве: {pagination.total}</Badge>
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Наименование</TableHead><TableHead>Инв. номер</TableHead><TableHead>Группа</TableHead>
                <TableHead>Остатки по МОЛ</TableHead><TableHead className="text-right">Кол-во</TableHead>
                <TableHead>Статус</TableHead><TableHead className="text-right">Действия</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {assets.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Архив пуст</TableCell></TableRow>
                ) : assets.map((asset) => {
                  const status = statusLabels[asset.status] || { label: asset.status, color: '' }
                  return <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.name}</TableCell>
                    <TableCell className="font-mono text-sm">{asset.inventoryNumber}</TableCell>
                    <TableCell><Badge variant="outline">{asset.group?.code}</Badge></TableCell>
                    <TableCell>{asset.holdings?.map((holding) => <div key={holding.id}>{holding.mol.fullName} · {formatDecimal(holding.quantity)}</div>)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(asset.quantity)} {asset.unitOfMeasure}</TableCell>
                    <TableCell><span className={`rounded-full px-2 py-1 text-xs font-medium ${status.color}`}>{status.label}</span></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/assets/${asset.id}`}><Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button></Link>
                      {canEdit && <Button variant="ghost" size="icon" disabled={asset.status === 'FULLY_DISPOSED'} onClick={() => handleRestore(asset.id)} title={asset.status === 'FULLY_DISPOSED' ? 'Полностью списанный объект нельзя восстановить' : 'Восстановить'}><RotateCcw className="h-4 w-4" /></Button>}
                    </TableCell>
                  </TableRow>
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
          {pagination.totalPages > 1 && <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" disabled={pagination.page <= 1} onClick={() => updateQuery({ page: pagination.page - 1 })}>Назад</Button>
            <Button variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => updateQuery({ page: pagination.page + 1 })}>Далее</Button>
          </div>}
        </div>
      </div>
    </div>
  )
}

function ArchiveSelect({ label, value, placeholder, options, onChange }: {
  label: string
  value?: string
  placeholder: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return <div className="space-y-2">
    <Label className="text-xs">{label}</Label>
    <Select value={value || 'ALL'} onValueChange={(val) => onChange(val === 'ALL' ? '' : val)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">{placeholder}</SelectItem>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
}
