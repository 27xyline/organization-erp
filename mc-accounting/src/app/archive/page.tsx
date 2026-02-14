'use client'

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
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Archive, Search, Filter, X, RotateCcw, Eye, FileSpreadsheet } from "lucide-react"
import Link from "next/link"
import { formatDate, formatCurrency, formatDecimal } from "@/lib/utils"

interface Filters {
  search: string
  molId: string
  groupId: string
  status: string
}

const initialFilters: Filters = {
  search: "",
  molId: "",
  groupId: "",
  status: "",
}

const statusLabels: Record<string, { label: string; color: string }> = {
  IN_STOCK: { label: "В наличии", color: "bg-green-100 text-green-800" },
  IN_USE: { label: "В эксплуатации", color: "bg-blue-100 text-blue-800" },
  UNDER_REPAIR: { label: "На ремонте", color: "bg-yellow-100 text-yellow-800" },
  PLANNED_FOR_DISPOSAL: { label: "К списанию", color: "bg-orange-100 text-orange-800" },
  PARTIALLY_DISPOSED: { label: "Частично списан", color: "bg-gray-100 text-gray-800" },
  FULLY_DISPOSED: { label: "Полностью списан", color: "bg-red-100 text-red-800" },
}

export default function ArchivePage() {
  const [assets, setAssets] = useState([])
  const [mols, setMols] = useState([])
  const [groups, setGroups] = useState([])
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [showFilters, setShowFilters] = useState(true)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [assetsRes, molsRes, groupsRes] = await Promise.all([
        fetch('/api/assets?isArchived=true'),
        fetch('/api/mols'),
        fetch('/api/groups'),
      ])
      
      const [assetsData, molsData, groupsData] = await Promise.all([
        assetsRes.json(),
        molsRes.json(),
        groupsRes.json(),
      ])
      
      setAssets(assetsData)
      setMols(molsData)
      setGroups(groupsData)
      setLoading(false)
    } catch (error) {
      console.error('Error loading data:', error)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await fetch('/api/export?type=assets')
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `archive_export_${new Date().toISOString().split('T')[0]}.xlsx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Export error:', error)
    } finally {
      setExporting(false)
    }
  }

  const handleRestore = async (assetId: string) => {
    if (!confirm('Вы уверены, что хотите восстановить объект из архива?')) return
    
    try {
      const res = await fetch(`/api/assets/${assetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isArchived: false,
          status: 'IN_STOCK'
        }),
      })
      
      if (res.ok) {
        loadData()
      }
    } catch (error) {
      console.error('Error restoring asset:', error)
    }
  }

  const filteredAssets = assets.filter((asset: any) => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const matchesSearch = 
        asset.name.toLowerCase().includes(searchLower) ||
        asset.inventoryNumber.toLowerCase().includes(searchLower)
      if (!matchesSearch) return false
    }

    if (filters.molId && asset.molId !== filters.molId) return false
    if (filters.groupId && asset.groupId !== filters.groupId) return false
    if (filters.status && asset.status !== filters.status) return false

    return true
  })

  const activeFiltersCount = Object.values(filters).filter(v => v !== "").length

  return (
    <div className="h-full flex flex-col">
      {/* Шапка */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Archive className="h-6 w-6" />
              Архив
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Списанные и архивированные объекты
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleExport}
              disabled={exporting}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {exporting ? 'Экспорт...' : 'Экспорт в Excel'}
            </Button>
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
          </div>
        </div>

        {/* Поиск */}
        <div className="mt-4 flex gap-2">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по архиву..."
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
            <CardContent className="p-4 space-y-4">
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
            </CardContent>
          </Card>
        )}

        {/* Таблица */}
        <div className="flex-1 p-4 overflow-auto">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Показано {filteredAssets.length} из {assets.length} объектов
            </span>
            <Badge variant="secondary">
              Всего в архиве: {assets.length}
            </Badge>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Загрузка...</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 text-center">№</TableHead>
                      <TableHead>Наименование</TableHead>
                      <TableHead>Инв. номер</TableHead>
                      <TableHead>Группа</TableHead>
                      <TableHead>МОЛ</TableHead>
                      <TableHead className="text-right">Кол-во</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Архив пуст
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAssets.map((asset: any, index: number) => {
                        const status = statusLabels[asset.status] || { label: asset.status, color: "" }
                        
                        return (
                          <TableRow key={asset.id}>
                            <TableCell className="text-center font-medium">{index + 1}</TableCell>
                            <TableCell className="font-medium">{asset.name}</TableCell>
                            <TableCell className="font-mono text-sm">{asset.inventoryNumber}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {asset.group?.code}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{asset.mol?.fullName}</div>
                              <div className="text-xs text-muted-foreground">{asset.mol?.code}</div>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatDecimal(asset.quantity)} {asset.unitOfMeasure}
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                                {status.label}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Link href={`/assets/${asset.id}`}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8"
                                  onClick={() => handleRestore(asset.id)}
                                  title="Восстановить"
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}