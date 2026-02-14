"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

interface Filters {
  search: string
  molId: string
  groupId: string
  status: string
  dateFrom: string
  dateTo: string
}

const initialFilters: Filters = {
  search: "",
  molId: "",
  groupId: "",
  status: "",
  dateFrom: "",
  dateTo: "",
}

export default function AssetsPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [showFilters, setShowFilters] = useState(true)
  const [assets, setAssets] = useState([])
  const [mols, setMols] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Загрузка данных
    Promise.all([
      fetch('/api/assets').then(r => r.json()),
      fetch('/api/mols').then(r => r.json()),
      fetch('/api/groups').then(r => r.json()),
    ]).then(([assetsData, molsData, groupsData]) => {
      setAssets(assetsData)
      setMols(molsData)
      setGroups(groupsData)
      setLoading(false)
    })
  }, [])

  const filteredAssets = assets.filter((asset: any) => {
    // Поиск по тексту
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const matchesSearch = 
        asset.name.toLowerCase().includes(searchLower) ||
        asset.inventoryNumber.toLowerCase().includes(searchLower) ||
        asset.documentDetails?.toLowerCase().includes(searchLower)
      if (!matchesSearch) return false
    }

    // Фильтр по МОЛ
    if (filters.molId && asset.molId !== filters.molId) return false

    // Фильтр по группе
    if (filters.groupId && asset.groupId !== filters.groupId) return false

    // Фильтр по статусу
    if (filters.status && asset.status !== filters.status) return false

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
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Загрузка...</p>
            </div>
          ) : (
            <AssetsDataTable 
              assets={filteredAssets} 
              totalCount={assets.length}
              filteredCount={filteredAssets.length}
            />
          )}
        </div>
      </div>
    </div>
  )
}