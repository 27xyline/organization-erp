"use client"

import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Eye, 
  Edit, 
  Trash2, 
  ArrowRightLeft, 
  Image as ImageIcon,
  Calendar,
  FileText
} from "lucide-react"
import Link from "next/link"
import { formatDate, formatCurrency, formatDecimal } from "@/lib/utils"
import type { Asset } from "@/features/assets/contracts/types"

interface AssetsDataTableProps {
  assets: Asset[]
  totalCount: number
  filteredCount: number
  onArchive?: (assetId: string) => void
  canEdit?: boolean
}

function AssetThumbnail({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className="w-10 h-10 rounded bg-muted/50 flex items-center justify-center shrink-0">
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      </div>
    )
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={name}
      onError={() => setFailed(true)}
      className="w-10 h-10 rounded object-cover border shrink-0"
    />
  )
}

const statusLabels: Record<string, { label: string; color: string }> = {
  IN_STOCK: { label: "В наличии", color: "bg-green-100 text-green-800" },
  IN_USE: { label: "В эксплуатации", color: "bg-blue-100 text-blue-800" },
  UNDER_REPAIR: { label: "На ремонте", color: "bg-yellow-100 text-yellow-800" },
  PLANNED_FOR_DISPOSAL: { label: "К списанию", color: "bg-orange-100 text-orange-800" },
  PARTIALLY_DISPOSED: { label: "Частично списан", color: "bg-gray-100 text-gray-800" },
  FULLY_DISPOSED: { label: "Полностью списан", color: "bg-red-100 text-red-800" },
}

export function AssetsDataTable({ assets, totalCount, filteredCount, onArchive, canEdit = true }: AssetsDataTableProps) {
  const handleArchive = async (assetId: string) => {
    if (!confirm("Вы уверены, что хотите переместить объект в архив?")) return
    
    try {
      const res = await fetch(`/api/assets/${assetId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Ручное архивирование" }),
      })
      if (res.ok) {
        onArchive?.(assetId)
      }
    } catch (error) {
      console.error("Error archiving asset:", error)
    }
  }

  return (
    <div className="space-y-4">
      {/* Статистика */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Показано {filteredCount} из {totalCount} объектов
        </span>
      </div>

      {/* Таблица */}
      <div className="hidden overflow-x-auto rounded-md border bg-white lg:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 whitespace-nowrap">
              <TableHead className="w-12 text-center">№</TableHead>
              <TableHead className="w-16">Фото</TableHead>
              <TableHead className="min-w-[180px]">Наименование</TableHead>
              <TableHead>Инв. номер</TableHead>
              <TableHead>Группа</TableHead>
              <TableHead className="min-w-[150px]">МОЛ</TableHead>
              <TableHead className="text-center w-16">Форма</TableHead>
              <TableHead className="text-right">Кол-во</TableHead>
              <TableHead className="text-right">Стоимость</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-center">План. списание</TableHead>
              <TableHead className="text-center">Док-ты</TableHead>
              <TableHead className="text-right w-40">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                  Нет объектов для отображения
                </TableCell>
              </TableRow>
            ) : (
              assets.map((asset, index) => {
                const status = statusLabels[asset.status] || { label: asset.status, color: "bg-gray-100 text-gray-800" }
                const hasDocuments = asset.documentFiles && asset.documentFiles.length > 0
                const hasPlannedDisposal = asset.plannedDisposalDate

                const holdingsList = asset.holdings?.length
                  ? asset.holdings
                  : asset.mol
                    ? [{ id: 'default', mol: asset.mol, quantity: asset.quantity }]
                    : []

                return (
                  <TableRow 
                    key={asset.id}
                  >
                    <TableCell className="text-center font-medium">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <AssetThumbnail src={asset.photos?.[0]} name={asset.name} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="max-w-xs">
                        <div className="truncate">{asset.name}</div>
                        {asset.notes && (
                          <div className="text-xs text-muted-foreground truncate mt-1">
                            {asset.notes}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm whitespace-nowrap">
                      {asset.inventoryNumber}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline" className="text-xs">
                        {asset.group?.code}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {holdingsList.map((holding, hIdx) => (
                        <div key={holding.id || holding.mol?.id || hIdx} className="text-sm whitespace-nowrap">
                          {holding.mol?.fullName || 'Не указан'}
                          <span className="text-xs text-muted-foreground"> · {formatDecimal(holding.quantity)}</span>
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs font-mono">
                        {asset.accountingForm || '145'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {formatDecimal(asset.quantity)} {asset.unitOfMeasure}
                    </TableCell>
                    <TableCell className="text-right font-mono whitespace-nowrap">
                      {formatCurrency(asset.totalCost)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${status.color}`}>
                        {status.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {hasPlannedDisposal ? (
                        <div className="flex items-center justify-center gap-1 text-sm">
                          <Calendar className="h-3 w-3 text-orange-500" />
                          {formatDate(asset.plannedDisposalDate!)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {hasDocuments ? (
                        <div className="flex items-center justify-center">
                          <Badge variant="secondary" className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            {asset.documentFiles.length}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/assets/${asset.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        {canEdit && (
                          <>
                            <Link href={`/assets/${asset.id}/edit`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Link href={`/assets/${asset.id}/transfer`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ArrowRightLeft className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleArchive(asset.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div data-testid="assets-mobile-list" aria-label="Карточки имущества" className="space-y-3 lg:hidden">
        {assets.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Нет объектов для отображения
          </div>
        ) : assets.map((asset) => {
          const status = statusLabels[asset.status] || { label: asset.status, color: "bg-gray-100 text-gray-800" }
          const holdingsList = asset.holdings?.length
            ? asset.holdings
            : asset.mol
              ? [{ id: 'default', mol: asset.mol, quantity: asset.quantity }]
              : []

          return (
            <article key={asset.id} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <AssetThumbnail src={asset.photos?.[0]} name={asset.name} />
                <div className="min-w-0 flex-1">
                  <Link href={`/assets/${asset.id}`} className="line-clamp-2 font-semibold leading-5 hover:underline">
                    {asset.name}
                  </Link>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{asset.inventoryNumber}</p>
                  {asset.notes && (
                    <p className="mt-2 line-clamp-3 break-words text-sm text-muted-foreground">{asset.notes}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}>
                  {status.label}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Группа</dt>
                  <dd className="mt-0.5 break-words">{asset.group?.name || 'Не указана'}</dd>
                  {asset.group?.code && <dd className="mt-0.5 font-mono text-xs text-muted-foreground">{asset.group.code}</dd>}
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">МОЛ</dt>
                  <dd className="mt-0.5 space-y-1 break-words">
                    {holdingsList.length ? holdingsList.map((holding, index) => (
                      <div key={holding.id || holding.mol?.id || index}>
                        <span>{holding.mol?.fullName || 'Не указан'}</span>
                        <span className="text-xs text-muted-foreground"> · {formatDecimal(holding.quantity)} {asset.unitOfMeasure}</span>
                      </div>
                    )) : 'Не указан'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Форма учета</dt>
                  <dd className="mt-0.5 font-mono">{asset.accountingForm || '145'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Количество</dt>
                  <dd className="mt-0.5">{formatDecimal(asset.quantity)} {asset.unitOfMeasure}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Стоимость</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{formatCurrency(asset.totalCost)}</dd>
                </div>
                {asset.plannedDisposalDate && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Плановое списание</dt>
                    <dd className="mt-0.5">{formatDate(asset.plannedDisposalDate)}</dd>
                  </div>
                )}
                {asset.documentFiles.length > 0 && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Документы</dt>
                    <dd className="mt-0.5">{asset.documentFiles.length}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                <Link href={`/assets/${asset.id}`}>
                  <Button variant="outline" size="sm"><Eye className="mr-2 h-4 w-4" />Открыть</Button>
                </Link>
                {canEdit && (
                  <>
                    <Link href={`/assets/${asset.id}/edit`}>
                      <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Редактировать: ${asset.name}`}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Link href={`/assets/${asset.id}/transfer`}>
                      <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Передать: ${asset.name}`}>
                        <ArrowRightLeft className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      aria-label={`В архив: ${asset.name}`}
                      onClick={() => handleArchive(asset.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
