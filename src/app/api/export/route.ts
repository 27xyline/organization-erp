import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { PassThrough, Readable } from 'node:stream'
import { authorizeApiRequest } from '@/lib/auth/authorization'
import { ExportService } from '@/features/exports/export.service'
import { apiError } from '@/lib/http/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeApiRequest(request)
  if (auth.response) return auth.response

  try {
    const { searchParams } = request.nextUrl
    const type = searchParams.get('type') || 'assets'
    
    let data: Record<string, string | number>[] = []
    let filename = ''
    let headers: string[] = []
    
    if (type === 'assets') {
      // Export assets
      const archivedParam = searchParams.get('archived')
      const archived = archivedParam === null ? undefined : archivedParam === 'true'
      const assets = await ExportService.assets(archived)
      
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
        'МОЛ': asset.holdings.map((holding) => `${holding.mol.fullName} (${holding.quantity.toString()})`).join('; '),
        'Подразделение': [...new Set(asset.holdings.map((holding) => holding.mol.department))].join('; '),
        'Место хранения': [...new Set(asset.holdings.map((holding) => holding.mol.storageLocation))].join('; '),
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
      const operations = await ExportService.operations()
      
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
    } else {
      return apiError('UNSUPPORTED_EXPORT_TYPE', 'Неизвестный тип экспорта', 422)
    }

    const output = new PassThrough()
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: output,
      useStyles: true,
      useSharedStrings: true,
    })
    const worksheet = workbook.addWorksheet('Data')
    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.max(14, Math.min(40, header.length + 4)),
    }))
    worksheet.getRow(1).font = { bold: true }
    worksheet.getRow(1).commit()
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]
    for (const row of data) worksheet.addRow(row).commit()
    worksheet.commit()
    void workbook.commit().catch((error) => output.destroy(error))

    return new NextResponse(Readable.toWeb(output) as ReadableStream, {
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
