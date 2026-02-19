import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { OperationType } from '@/types'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(asset)
  } catch (error) {
    console.error('Error fetching asset:', error)
    return NextResponse.json(
      { error: 'Failed to fetch asset' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    
    // Получаем текущий объект для сравнения со всеми связями
    const currentAsset = await prisma.asset.findUnique({
      where: { id: params.id },
      include: { mol: true, group: true }
    })
    
    if (!currentAsset) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      )
    }
    // Validate: редактирование требует основания
    if (data.editReason === undefined || String(data.editReason).trim() === '') {
      return NextResponse.json({ error: 'Основание редактирования обязательно' }, { status: 400 })
    }
    
    // Получаем новые МОЛ и группу для отображения названий
    const [newMol, newGroup] = await Promise.all([
      data.molId !== currentAsset.molId 
        ? prisma.mol.findUnique({ where: { id: data.molId } })
        : currentAsset.mol,
      data.groupId !== currentAsset.groupId
        ? prisma.assetGroup.findUnique({ where: { id: data.groupId } })
        : currentAsset.group
    ])
    
    const totalCost = Number(data.unitPrice) * Number(data.quantity)
    
    // Обновляем объект
    const asset = await prisma.asset.update({
      where: { id: params.id },
      data: {
        name: data.name,
        inventoryNumber: data.inventoryNumber,
        unitPrice: data.unitPrice,
        unitOfMeasure: data.unitOfMeasure,
        quantity: data.quantity,
        totalCost,
        molId: data.molId,
        groupId: data.groupId,
        projectId: data.projectId || null,
        contractCode: data.contractCode,
        internalFundingCode: data.internalFundingCode,
        isExistingAsset: data.isExistingAsset,
        recordingDate: new Date(data.recordingDate),
        documentType: data.documentType,
        documentDetails: data.documentDetails,
        documentFiles: data.documentFiles,
        status: data.status,
        isArchived: data.isArchived,
        plannedDisposalDate: data.plannedDisposalDate ? new Date(data.plannedDisposalDate) : null,
        plannedDisposalReason: data.plannedDisposalReason,
        notes: data.notes,
        photos: data.photos || [],
        accountingForm: data.accountingForm || '145',
      },
      include: {
        mol: true,
        group: true,
      },
    })
    
    // Создаем операцию с описанием изменений
    const changes: string[] = []
    
    // Функция для сравнения дат (без времени)
    const compareDates = (date1: Date | null, date2: string | null): boolean => {
      if (!date1 && !date2) return true
      if (!date1 || !date2) return false
      const d1 = new Date(date1)
      const d2 = new Date(date2)
      return d1.toDateString() === d2.toDateString()
    }
    
    if (currentAsset.name !== data.name) {
      changes.push(`Наименование: "${currentAsset.name}" → "${data.name}"`)
    }
    if (currentAsset.inventoryNumber !== data.inventoryNumber) {
      changes.push(`Инв. номер: "${currentAsset.inventoryNumber}" → "${data.inventoryNumber}"`)
    }
    if (Number(currentAsset.unitPrice) !== Number(data.unitPrice)) {
      changes.push(`Цена: ${currentAsset.unitPrice} → ${data.unitPrice}`)
    }
    if (Number(currentAsset.quantity) !== Number(data.quantity)) {
      changes.push(`Количество: ${currentAsset.quantity} → ${data.quantity}`)
    }
    if (currentAsset.status !== data.status) {
      changes.push(`Статус: "${currentAsset.status}" → "${data.status}"`)
    }
    if (currentAsset.molId !== data.molId) {
      const oldMolName = currentAsset.mol?.fullName || currentAsset.mol?.code || 'Неизвестно'
      const newMolName = newMol?.fullName || newMol?.code || 'Неизвестно'
      changes.push(`МОЛ: "${oldMolName}" → "${newMolName}"`)
    }
    if (currentAsset.groupId !== data.groupId) {
      const oldGroupName = currentAsset.group?.name || currentAsset.group?.code || 'Неизвестно'
      const newGroupName = newGroup?.name || newGroup?.code || 'Неизвестно'
      changes.push(`Группа: "${oldGroupName}" → "${newGroupName}"`)
    }
    if ((currentAsset.notes || '') !== (data.notes || '')) {
      const oldNotes = currentAsset.notes || '(пусто)'
      const newNotes = data.notes || '(пусто)'
      changes.push(`Примечания: "${oldNotes.substring(0, 50)}${oldNotes.length > 50 ? '...' : ''}" → "${newNotes.substring(0, 50)}${newNotes.length > 50 ? '...' : ''}"`)
    }
    if (!compareDates(currentAsset.plannedDisposalDate, data.plannedDisposalDate)) {
      const oldDate = currentAsset.plannedDisposalDate 
        ? new Date(currentAsset.plannedDisposalDate).toLocaleDateString('ru-RU')
        : '(не установлена)'
      const newDate = data.plannedDisposalDate
        ? new Date(data.plannedDisposalDate).toLocaleDateString('ru-RU')
        : '(не установлена)'
      changes.push(`Плановая дата списания: "${oldDate}" → "${newDate}"`)
    }
    if ((currentAsset.plannedDisposalReason || '') !== (data.plannedDisposalReason || '')) {
      const oldReason = currentAsset.plannedDisposalReason || '(пусто)'
      const newReason = data.plannedDisposalReason || '(пусто)'
      changes.push(`Причина списания: "${oldReason}" → "${newReason}"`)
    }
    if (currentAsset.contractCode !== data.contractCode) {
      const oldCode = currentAsset.contractCode || '(пусто)'
      const newCode = data.contractCode || '(пусто)'
      changes.push(`Код договора: "${oldCode}" → "${newCode}"`)
    }
    if (currentAsset.internalFundingCode !== data.internalFundingCode) {
      const oldCode = currentAsset.internalFundingCode || '(пусто)'
      const newCode = data.internalFundingCode || '(пусто)'
      changes.push(`Код финансирования: "${oldCode}" → "${newCode}"`)
    }
    if (currentAsset.documentType !== data.documentType) {
      changes.push(`Вид документа: "${currentAsset.documentType}" → "${data.documentType}"`)
    }
    if (currentAsset.documentDetails !== data.documentDetails) {
      const oldDetails = currentAsset.documentDetails || '(пусто)'
      const newDetails = data.documentDetails || '(пусто)'
      changes.push(`Реквизиты документа: "${oldDetails.substring(0, 50)}..." → "${newDetails.substring(0, 50)}..."`)
    }
    if (currentAsset.unitOfMeasure !== data.unitOfMeasure) {
      changes.push(`Ед. измерения: "${currentAsset.unitOfMeasure}" → "${data.unitOfMeasure}"`)
    }
    if (Boolean(currentAsset.isExistingAsset) !== Boolean(data.isExistingAsset)) {
      const oldValue = currentAsset.isExistingAsset ? 'Да' : 'Нет'
      const newValue = data.isExistingAsset ? 'Да' : 'Нет'
      changes.push(`Существующее имущество: "${oldValue}" → "${newValue}"`)
    }
    
    // Если есть изменения, создаем операцию
    if (changes.length > 0) {
      await prisma.operation.create({
        data: {
          type: OperationType.STATUS_CHANGE,
          assetId: asset.id,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          totalCost,
          date: new Date(),
          reason: `Редактирование объекта:\n${changes.join('\n')}`,
          documentType: data.editReason || 'Редактирование',
          documentDetails: data.editReason || 'Изменение данных объекта',
          oldStatus: currentAsset.status,
          newStatus: data.status,
        },
      })
    }
    
    return NextResponse.json(asset)
  } catch (error) {
    console.error('Error updating asset:', error)
    return NextResponse.json(
      { error: 'Failed to update asset' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Instead of deleting, we archive the asset
    const asset = await prisma.asset.update({
      where: { id: params.id },
      data: {
        isArchived: true,
        status: 'FULLY_DISPOSED',
      },
    })
    
    // Создаем операцию архивирования
    await prisma.operation.create({
      data: {
        type: OperationType.STATUS_CHANGE,
        assetId: asset.id,
        quantity: asset.quantity,
        unitPrice: asset.unitPrice,
        totalCost: asset.totalCost,
        date: new Date(),
        reason: 'Объект перемещен в архив',
        documentType: 'Архивирование',
        documentDetails: 'Полное списание и архивирование',
        oldStatus: asset.status,
        newStatus: 'FULLY_DISPOSED',
      },
    })
    
    return NextResponse.json(asset)
  } catch (error) {
    console.error('Error archiving asset:', error)
    return NextResponse.json(
      { error: 'Failed to archive asset' },
      { status: 500 }
    )
  }
}
