import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, formatCurrency, formatDecimal } from '@/lib/utils'
import { AssetStatusLabels } from '@/types'
import { ArrowLeft, Edit, ArrowRightLeft, FileText, Calendar, Image as ImageIcon } from 'lucide-react'
import { AssetOperationsHistory } from '@/components/asset-operations-history'
import { AssetService } from '@/features/assets/asset.service'
import { requirePageUser } from '@/lib/auth/authorization'

interface AssetDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function AssetDetailPage(props: AssetDetailPageProps) {
  await requirePageUser()
  const params = await props.params
  const asset = await AssetService.get(params.id)

  if (!asset) {
    notFound()
  }

  return (
    <main className="container mx-auto py-8 px-4">
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" className="pl-0">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к списку
          </Button>
        </Link>
      </div>

      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">{asset.name}</h1>
          <p className="text-muted-foreground">
            Инв. номер: {asset.inventoryNumber} | 
            № п/п: {asset.orderNumber}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/assets/${asset.id}/edit`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Редактировать
            </Button>
          </Link>
          <Link href={`/assets/${asset.id}/transfer`}>
            <Button variant="outline">
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Передать
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Основная информация</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Группа</p>
                <p className="font-medium">{asset.group.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Статус</p>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  asset.status === 'IN_STOCK' ? 'bg-green-100 text-green-800' :
                  asset.status === 'IN_USE' ? 'bg-blue-100 text-blue-800' :
                  asset.status === 'UNDER_REPAIR' ? 'bg-yellow-100 text-yellow-800' :
                  asset.status === 'PLANNED_FOR_DISPOSAL' ? 'bg-orange-100 text-orange-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {AssetStatusLabels[asset.status]}
                </span>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">Остатки по МОЛ</p>
              <div className="space-y-2">
                {asset.holdings.map((holding) => (
                  <div key={holding.id} className="flex items-start justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium">{holding.mol.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {holding.mol.department} · {holding.mol.storageLocation}
                      </p>
                    </div>
                    <p className="font-medium">
                      {formatDecimal(holding.quantity.toString())} {asset.unitOfMeasure}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Цена за ед.</p>
                <p className="font-medium">{formatCurrency(asset.unitPrice.toString())}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Количество</p>
                <p className="font-medium">{formatDecimal(asset.quantity.toString())} {asset.unitOfMeasure}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Общая стоимость</p>
                <p className="font-medium">{formatCurrency(asset.totalCost.toString())}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Источник и документы</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Дата постановки на баланс</p>
                <p className="font-medium">{formatDate(asset.recordingDate)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Вид документа</p>
                <p className="font-medium">{asset.documentType}</p>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Реквизиты документа</p>
              <p className="font-medium">{asset.documentDetails}</p>
            </div>

            {asset.contractCode && (
              <div>
                <p className="text-sm text-muted-foreground">Код договора</p>
                <p className="font-medium">{asset.contractCode}</p>
              </div>
            )}

            {asset.internalFundingCode && (
              <div>
                <p className="text-sm text-muted-foreground">Код внутреннего финансирования</p>
                <p className="font-medium">{asset.internalFundingCode}</p>
              </div>
            )}

            {asset.isExistingAsset && (
              <div className="bg-yellow-50 p-3 rounded-md">
                <p className="text-sm text-yellow-800">
                  Существующее имущество (без документов)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Дополнительная информация */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Дополнительная информация</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">ID объекта</p>
              <p className="font-mono text-sm">{asset.id}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Единица измерения</p>
              <p className="font-medium">{asset.unitOfMeasure}</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Дата создания</p>
              <p className="font-medium">{formatDate(asset.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Дата обновления</p>
              <p className="font-medium">{formatDate(asset.updatedAt)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Прикрепленные файлы</p>
                <p className="font-medium">{asset.documentFiles?.length || 0} файл(ов)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Фотографии</p>
                <p className="font-medium">{asset.photos?.length || 0} фото</p>
              </div>
            </div>
          </div>

          {asset.isArchived && (
            <div className="bg-gray-100 p-3 rounded-md">
              <p className="text-sm font-medium text-gray-800">Объект находится в архиве</p>
            </div>
          )}

          {asset.notes && (
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">Примечания</p>
              <p className="font-medium whitespace-pre-wrap">{asset.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Плановое списание */}
      {(asset.plannedDisposalDate || asset.plannedDisposalReason) && (
        <Card className="mt-6 border-orange-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <Calendar className="h-5 w-5" />
              Плановое списание
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {asset.plannedDisposalDate && (
              <div>
                <p className="text-sm text-muted-foreground">Дата планового списания</p>
                <p className="font-medium">{formatDate(asset.plannedDisposalDate)}</p>
              </div>
            )}
            {asset.plannedDisposalReason && (
              <div>
                <p className="text-sm text-muted-foreground">Причина планового списания</p>
                <p className="font-medium">{asset.plannedDisposalReason}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* История операций */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>История операций</CardTitle>
        </CardHeader>
        <CardContent>
          <AssetOperationsHistory operations={asset.operations} />
        </CardContent>
      </Card>
    </main>
  )
}
