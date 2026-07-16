'use client'

import { useState } from 'react'
import { Asset, AssetGroup, Mol, AssetStatusLabels } from '@/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate, formatCurrency, formatDecimal } from '@/lib/utils'
import { Search, Eye, Edit, Archive, ArrowRightLeft, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface AssetsTableProps {
  assets: Asset[]
  groups: AssetGroup[]
  mols: Mol[]
}

export function AssetsTable({ assets, groups, mols }: AssetsTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const router = useRouter()

  const filteredAssets = assets.filter(asset => 
    asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    asset.inventoryNumber.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleArchive = async (assetId: string) => {
    if (!confirm('Вы уверены, что хотите переместить объект в архив?')) return
    
    try {
      const res = await fetch(`/api/assets/${assetId}`, {
        method: 'DELETE',
      })
      
      if (res.ok) {
        router.refresh()
      }
    } catch (error) {
      console.error('Error archiving asset:', error)
    }
  }

  const groupMap = new Map(groups.map(g => [g.id, g]))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по наименованию или инв. номеру..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">№ п/п</TableHead>
              <TableHead>Наименование</TableHead>
              <TableHead>Инв. номер</TableHead>
              <TableHead>Группа</TableHead>
              <TableHead className="text-right">Цена</TableHead>
              <TableHead>Ед. изм.</TableHead>
              <TableHead className="text-right">Кол-во</TableHead>
              <TableHead className="text-right">Стоимость</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAssets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  Нет объектов для отображения
                </TableCell>
              </TableRow>
            ) : (
              filteredAssets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell>{asset.orderNumber}</TableCell>
                  <TableCell className="font-medium">{asset.name}</TableCell>
                  <TableCell>{asset.inventoryNumber}</TableCell>
                  <TableCell>{groupMap.get(asset.groupId)?.name || '-'}</TableCell>
                  <TableCell className="text-right">{formatCurrency(asset.unitPrice)}</TableCell>
                  <TableCell>{asset.unitOfMeasure}</TableCell>
                  <TableCell className="text-right">{formatDecimal(asset.quantity)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(asset.totalCost)}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      asset.status === 'IN_STOCK' ? 'bg-green-100 text-green-800' :
                      asset.status === 'IN_USE' ? 'bg-blue-100 text-blue-800' :
                      asset.status === 'UNDER_REPAIR' ? 'bg-yellow-100 text-yellow-800' :
                      asset.status === 'PLANNED_FOR_DISPOSAL' ? 'bg-orange-100 text-orange-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {AssetStatusLabels[asset.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/assets/${asset.id}`}>
                        <Button variant="ghost" size="icon" title="Просмотр">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/assets/${asset.id}/edit`}>
                        <Button variant="ghost" size="icon" title="Редактировать">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/assets/${asset.id}/transfer`}>
                        <Button variant="ghost" size="icon" title="Передать">
                          <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        title="В архив"
                        onClick={() => handleArchive(asset.id)}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}