import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const type = searchParams.get('type') || 'assets'
    
    let data: any[] = []
    let filename = ''
    let headers: string[] = []
    
    if (type === 'assets') {
      // Export assets
      const assets = await prisma.asset.findMany({
        include: {
          mol: true,
          group: true,
        },
        orderBy: { orderNumber: 'asc' },
      })
      
      filename = `assets_export_${new Date().toISOString().split('T')[0]}.xlsx`
      headers = [
        'ID',
        '№ п/п',
        'Наименование',
        'Инвентарный номер',
        'Группа',
        'МОЛ',
        'Подразделение',
        'Место хранения',
        'Цена за ед.',
        'Ед. изм.',
        'Количество',
        'Общая стоимость',
        'Статус',
        'Дата постановки на баланс',
        'Вид документа',
        'Реквизиты документа',
        'Код договора',
        'Код финансирования',
        'Существующее имущество',
        'В архиве',
        'Плановая дата списания',
        'Причина планового списания',
        'Примечания',
        'Количество файлов',
        'Количество фото',
        'Дата создания',
        'Дата обновления',
      ]
      
      data = assets.map(asset => ({
        'ID': asset.id,
        '№ п/п': asset.orderNumber,
        'Наименование': asset.name,
        'Инвентарный номер': asset.inventoryNumber,
        'Группа': asset.group.name,
        'МОЛ': asset.mol.fullName,
        'Подразделение': asset.mol.department,
        'Место хранения': asset.mol.storageLocation,
        'Цена за ед.': Number(asset.unitPrice),
        'Ед. изм.': asset.unitOfMeasure,
        'Количество': Number(asset.quantity),
        'Общая стоимость': Number(asset.totalCost),
        'Статус': getStatusLabel(asset.status),
        'Дата постановки на баланс': new Date(asset.recordingDate).toLocaleDateString('ru-RU'),
        'Вид документа': asset.documentType,
        'Реквизиты документа': asset.documentDetails,
        'Код договора': asset.contractCode || '',
        'Код финансирования': asset.internalFundingCode || '',
        'Существующее имущество': asset.isExistingAsset ? 'Да' : 'Нет',
        'В архиве': asset.isArchived ? 'Да' : 'Нет',
        'Плановая дата списания': asset.plannedDisposalDate ? new Date(asset.plannedDisposalDate).toLocaleDateString('ru-RU') : '',
        'Причина планового списания': asset.plannedDisposalReason || '',
        'Примечания': asset.notes || '',
        'Количество файлов': asset.documentFiles?.length || 0,
        'Количество фото': asset.photos?.length || 0,
        'Дата создания': new Date(asset.createdAt).toLocaleDateString('ru-RU'),
        'Дата обновления': new Date(asset.updatedAt).toLocaleDateString('ru-RU'),
      }))
    } else if (type === 'operations') {
      // Export operations
      const operations = await prisma.operation.findMany({
        include: {
          asset: {
            include: {
              mol: true,
              group: true,
            },
          },
          fromMol: true,
          toMol: true,
        },
        orderBy: { date: 'desc' },
      })
      
      filename = `operations_export_${new Date().toISOString().split('T')[0]}.xlsx`
      headers = [
        'ID операции',
        'Тип операции',
        'Наименование объекта',
        'Инвентарный номер',
        'Группа',
        'От кого (МОЛ)',
        'Кому (МОЛ)',
        'Количество',
        'Цена за ед.',
        'Общая стоимость',
        'Дата операции',
        'Основание',
        'Вид документа',
        'Реквизиты документа',
        'Старый статус',
        'Новый статус',
        'Дата создания записи',
      ]
      
      data = operations.map(op => ({
        'ID операции': op.id,
        'Тип операции': getOperationTypeLabel(op.type),
        'Наименование объекта': op.asset.name,
        'Инвентарный номер': op.asset.inventoryNumber,
        'Группа': op.asset.group.name,
        'От кого (МОЛ)': op.fromMol?.fullName || '-',
        'Кому (МОЛ)': op.toMol?.fullName || '-',
        'Количество': Number(op.quantity),
        'Цена за ед.': Number(op.unitPrice),
        'Общая стоимость': Number(op.totalCost),
        'Дата операции': new Date(op.date).toLocaleDateString('ru-RU'),
        'Основание': op.reason || '-',
        'Вид документа': op.documentType,
        'Реквизиты документа': op.documentDetails,
        'Старый статус': op.oldStatus ? getStatusLabel(op.oldStatus) : '-',
        'Новый статус': op.newStatus ? getStatusLabel(op.newStatus) : '-',
        'Дата создания записи': new Date(op.createdAt).toLocaleDateString('ru-RU'),
      }))
    }
    
    // Create workbook
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data, { header: headers })
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Data')
    
    // Generate buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    
    // Return response with file
    return new NextResponse(buf, {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    )
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'IN_STOCK': 'В наличии',
    'IN_USE': 'В эксплуатации',
    'UNDER_REPAIR': 'На ремонте',
    'PLANNED_FOR_DISPOSAL': 'К списанию',
    'PARTIALLY_DISPOSED': 'Частично списан',
    'FULLY_DISPOSED': 'Полностью списан',
  }
  return labels[status] || status
}

function getOperationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    'RECEIPT': 'Приход',
    'TRANSFER': 'Передача',
    'DISPOSAL': 'Списание',
    'STATUS_CHANGE': 'Изменение статуса',
  }
  return labels[type] || type
}
