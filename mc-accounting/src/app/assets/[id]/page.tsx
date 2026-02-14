import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, formatCurrency, formatDecimal } from '@/lib/utils'
import { AssetStatusLabels, OperationTypeLabels } from '@/types'
import { ArrowLeft, Edit, ArrowRightLeft, Trash2 } from 'lucide-react'

interface AssetDetailPageProps {
  params: { id: string }
}

export default async function AssetDetailPage({ params }: AssetDetailPageProps) {
  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    include: {
      mol: true,
      group: true,
      operations: {
        include: {
          fromMol: true,
          toMol: true,
        },
        orderBy: { date: 'desc' },
      },
    },
  })

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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">МОЛ</p>
                <p className="font-medium">{asset.mol.fullName}</p>
                <p className="text-sm text-muted-foreground">{asset.mol.department}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Место хранения</p>
                <p className="font-medium">{asset.mol.storageLocation}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Цена за ед.</p>
                <p className="font-medium">{formatCurrency(Number(asset.unitPrice))}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Количество</p>
                <p className="font-medium">{formatDecimal(Number(asset.quantity))} {asset.unitOfMeasure}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Общая стоимость</p>
                <p className="font-medium">{formatCurrency(Number(asset.totalCost))}</p>
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>История операций</CardTitle>
        </CardHeader>
        <CardContent>
          {asset.operations.length === 0 ? (
            <p className="text-muted-foreground">Нет операций</p>
          ) : (
            <div className="space-y-4">
              {asset.operations.map((operation) => (
                <div 
                  key={operation.id} 
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      operation.type === 'RECEIPT' ? 'bg-green-100 text-green-800' :
                      operation.type === 'TRANSFER' ? 'bg-blue-100 text-blue-800' :
                      operation.type === 'DISPOSAL' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      <span className="text-lg font-bold">
                        {operation.type === 'RECEIPT' ? '+' :
                         operation.type === 'DISPOSAL' ? '-' :
                         operation.type === 'TRANSFER' ? '→' : '○'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">
                        {OperationTypeLabels[operation.type]}
                        {operation.type === 'TRANSFER' && operation.toMol && (
                          <span className="text-muted-foreground">
                            {' '}→ {operation.toMol.fullName}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(operation.date)} | {operation.documentType}
                      </p>
                      {operation.reason && (
                        <p className="text-sm text-muted-foreground">
                          {operation.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {formatDecimal(Number(operation.quantity))} {asset.unitOfMeasure}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(Number(operation.totalCost))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}