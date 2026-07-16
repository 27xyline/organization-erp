'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Filter, Plus, Search, X } from 'lucide-react'
import { AssetsDataTable } from '@/features/assets/ui/assets-data-table'
import { ExportButton } from '@/features/exports/ui/export-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Asset, AssetGroup, Mol } from '@/features/assets/contracts/types'

interface AssetsPageClientProps {
  assets: Asset[]
  mols: Mol[]
  groups: AssetGroup[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  filters: {
    search?: string
    molId?: string
    groupId?: string
    status?: string
    accountingForm?: string
    dateFrom?: string
    dateTo?: string
  }
  canEdit: boolean
}

export function AssetsPageClient({
  assets,
  mols,
  groups,
  pagination,
  filters,
  canEdit,
}: AssetsPageClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [showFilters, setShowFilters] = useState(true)
  const [search, setSearch] = useState(filters.search || '')

  const updateQuery = (changes: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    if (!Object.prototype.hasOwnProperty.call(changes, 'page')) next.delete('page')
    router.push(`${pathname}${next.size ? `?${next.toString()}` : ''}`)
  }

  const activeFiltersCount = Object.values(filters).filter(Boolean).length

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Имущество</h1>
            <p className="mt-1 text-sm text-muted-foreground">Учет материальных ценностей и активов</p>
          </div>
          <div className="flex gap-2">
            <ExportButton />
            <Button variant="outline" onClick={() => setShowFilters((visible) => !visible)}>
              <Filter className="mr-2 h-4 w-4" />
              Фильтры
              {activeFiltersCount > 0 && <Badge className="ml-2" variant="secondary">{activeFiltersCount}</Badge>}
            </Button>
            {canEdit && (
              <Link href="/assets/new">
                <Button><Plus className="mr-2 h-4 w-4" />Добавить</Button>
              </Link>
            )}
          </div>
        </div>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            updateQuery({ search })
          }}
        >
          <div className="relative max-w-xl flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Поиск по наименованию, инв. номеру или документу..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">Найти</Button>
          {activeFiltersCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearch('')
                router.push(pathname)
              }}
            >
              <X className="mr-2 h-4 w-4" />Сбросить
            </Button>
          )}
        </form>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {showFilters && (
          <Card className="m-4 mr-0 w-72 rounded-lg border-r-0">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Фильтры</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FilterSelect
                label="МОЛ"
                value={filters.molId}
                placeholder="Все МОЛ"
                onChange={(value) => updateQuery({ molId: value })}
                options={mols.map((mol) => ({ value: mol.id, label: `${mol.code} — ${mol.fullName}` }))}
              />
              <FilterSelect
                label="Группа имущества"
                value={filters.groupId}
                placeholder="Все группы"
                onChange={(value) => updateQuery({ groupId: value })}
                options={groups.map((group) => ({ value: group.id, label: `${group.code} — ${group.name}` }))}
              />
              <FilterSelect
                label="Статус"
                value={filters.status}
                placeholder="Все статусы"
                onChange={(value) => updateQuery({ status: value })}
                options={[
                  { value: 'IN_STOCK', label: 'В наличии' },
                  { value: 'IN_USE', label: 'В эксплуатации' },
                  { value: 'UNDER_REPAIR', label: 'На ремонте' },
                  { value: 'PLANNED_FOR_DISPOSAL', label: 'К списанию' },
                  { value: 'PARTIALLY_DISPOSED', label: 'Частично списан' },
                  { value: 'FULLY_DISPOSED', label: 'Полностью списан' },
                ]}
              />
              <div className="space-y-2">
                <Label className="text-xs">Форма учета</Label>
                <div className="flex gap-2">
                  {['145', '367'].map((form) => (
                    <Button
                      key={form}
                      className="flex-1"
                      size="sm"
                      variant={filters.accountingForm === form ? 'default' : 'outline'}
                      onClick={() => updateQuery({ accountingForm: filters.accountingForm === form ? undefined : form })}
                    >
                      {form}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Период поступления</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" value={filters.dateFrom || ''} onChange={(event) => updateQuery({ dateFrom: event.target.value })} />
                  <Input type="date" value={filters.dateTo || ''} onChange={(event) => updateQuery({ dateTo: event.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex-1 overflow-auto p-4">
          <AssetsDataTable
            assets={assets}
            totalCount={pagination.total}
            filteredCount={assets.length}
            canEdit={canEdit}
            onArchive={() => router.refresh()}
          />
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Страница {pagination.page} из {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={pagination.page <= 1} onClick={() => updateQuery({ page: pagination.page - 1 })}>
                  Назад
                </Button>
                <Button variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => updateQuery({ page: pagination.page + 1 })}>
                  Далее
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string
  value?: string
  placeholder: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
