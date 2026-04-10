"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AssetsDataTable } from "@/components/assets-data-table"
import { ExportButton } from "@/components/export-button"
import { Plus, Search, Filter, X } from "lucide-react"
import Link from "next/link"
import type { Asset, Mol, AssetGroup } from "@/types"

interface Filters {
  search: string
  molId: string
  groupId: string
  status: string
  accountingForm: string
  dateFrom: string
  dateTo: string
}

const initialFilters: Filters = {
  search: "",
  molId: "",
  groupId: "",
  status: "",
  accountingForm: "",
  dateFrom: "",
  dateTo: "",
}

export default function AssetsPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [showFilters, setShowFilters] = useState(true)
  const [assets, setAssets] = useState<Asset[]>([])
  const [mols, setMols] = useState<Mol[]>([])
  const [groups, setGroups] = useState<AssetGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadData = useCallback(async () => {
    setLoading(true)
    setError("")

    try {
      const [assetsResponse, molsResponse, groupsResponse] = await Promise.all([
        fetch('/api/assets'),
        fetch('/api/mols'),
        fetch('/api/groups'),
      ])

      if (!assetsResponse.ok || !molsResponse.ok || !groupsResponse.ok) {
        throw new Error('Не удалось загрузить данные')
      }

      const [assetsData, molsData, groupsData] = await Promise.all([
        assetsResponse.json(),
        molsResponse.json(),
        groupsResponse.json(),
      ])

      setAssets(assetsData.data || [])
      setMols(molsData)
      setGroups(groupsData)
    } catch (error) {
      console.error('Error loading assets page:', error)
      setError('Не удалось загрузить данные. Проверьте вход в систему и доступность API.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredAssets = assets.filter((asset) => {
    // Поиск по тексту
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const matchesSearch = 
        asset.name.toLowerCase().includes(searchLower) ||
        asset.inventoryNumber.toLowerCase().includes(searchLower) ||
        (asset.documentDetails || '').toLowerCase().includes(searchLower)
      if (!matchesSearch) return false
    }

    // Фильтр по МОЛ
    if (filters.molId && asset.molId !== filters.molId) return false

    // Фильтр по группе
    if (filters.groupId && asset.groupId !== filters.groupId) return false

    // Фильтр по статусу
    if (filters.status && asset.status !== filters.status) return false

    // Фильтр по форме учета
    if (filters.accountingForm && asset.accountingForm !== filters.accountingForm) return false

    // Фильтр по дате
    if (filters.dateFrom) {
      const assetDate = new Date(asset.recordingDate)
      const fromDate = new Date(filters.dateFrom)
      if (assetDate < fromDate) return false
    }

    if (filters.dateTo) {
      const assetDate = new Date(asset.recordingDate)
      const toDate = new Date(filters.dateTo)
      if (assetDate > toDate) return false
    }

    return true
  })

  const activeFiltersCount = Object.values(filters).filter(v => v !== "" && v !== null).length

  return (
    <div className="h-full flex flex-col">
      {/* Шапка */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Имущество</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Учет материальных ценностей и активов
            </p>
          </div>
          <div className="flex gap-2">
            <ExportButton />
            <Button 
              variant="outline" 
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Фильтры
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
            <Link href="/assets/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Добавить
              </Button>
            </Link>
          </div>
        </div>

        {/* Поиск */}
        <div className="mt-4 flex gap-2">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по наименованию, инв. номеру или документу..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>
          {activeFiltersCount > 0 && (
            <Button 
              variant="ghost" 
              onClick={() => setFilters(initialFilters)}
            >
              <X className="mr-2 h-4 w-4" />
              Сбросить
            </Button>
          )}
        </div>
      </div>

      {/* Основной контент */}
      <div className="flex-1 flex overflow-hidden">
        {/* Боковая панель фильтров */}
        {showFilters && (
          <Card className="w-72 m-4 rounded-lg border-r-0 mr-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Фильтры</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">МОЛ</Label>
                <Select
                  value={filters.molId}
                  onValueChange={(value) => setFilters({ ...filters, molId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Все МОЛ" />
                  </SelectTrigger>
                  <SelectContent>
                    {mols.map((mol: any) => (
                      <SelectItem key={mol.id} value={mol.id}>
                        {mol.code} - {mol.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Группа имущества</Label>
                <Select
                  value={filters.groupId}
                  onValueChange={(value) => setFilters({ ...filters, groupId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Все группы" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group: any) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.code} - {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Статус</Label>
                <Select
                  value={filters.status}
                  onValueChange={(value) => setFilters({ ...filters, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Все статусы" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN_STOCK">В наличии</SelectItem>
                    <SelectItem value="IN_USE">В эксплуатации</SelectItem>
                    <SelectItem value="UNDER_REPAIR">На ремонте</SelectItem>
                    <SelectItem value="PLANNED_FOR_DISPOSAL">К списанию</SelectItem>
                    <SelectItem value="PARTIALLY_DISPOSED">Частично списан</SelectItem>
                    <SelectItem value="FULLY_DISPOSED">Полностью списан</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Форма учета</Label>
                <div className="flex gap-2">
                  <Button
                    variant={filters.accountingForm === "145" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setFilters({ ...filters, accountingForm: filters.accountingForm === "145" ? "" : "145" })}
                  >
                    145
                  </Button>
                  <Button
                    variant={filters.accountingForm === "367" ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setFilters({ ...filters, accountingForm: filters.accountingForm === "367" ? "" : "367" })}
                  >
                    367
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Период поступления</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                    placeholder="С"
                  />
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                    placeholder="По"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Таблица */}
        <div className="flex-1 p-4 overflow-auto">
          {error && (
            <Card className="mb-4 border-destructive/30 bg-destructive/5">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" onClick={() => void loadData()}>
                  Повторить
                </Button>
              </CardContent>
            </Card>
          )}
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <AssetsDataTable 
              assets={filteredAssets} 
              totalCount={assets.length}
              filteredCount={filteredAssets.length}
              onArchive={() => loadData()}
            />
          )}
        </div>
      </div>
    </div>
  )
}
