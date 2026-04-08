import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { OperationType } from '@/types'
import { createAssetSchema, validateRequest } from '@/lib/validations'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const molId = searchParams.get('molId')
    const groupId = searchParams.get('groupId')
    const status = searchParams.get('status')
    const accountingForm = searchParams.get('accountingForm')
    const isArchived = searchParams.get('isArchived') === 'true'
    const search = searchParams.get('search')
    const page = Number(searchParams.get('page')) || 1
    const limit = Number(searchParams.get('limit')) || 50
    const skip = (page - 1) * limit
    
    const where: any = { isArchived }
    
    if (molId) where.molId = molId
    if (groupId) where.groupId = groupId
    if (status) where.status = status
    if (accountingForm) where.accountingForm = accountingForm
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { inventoryNumber: { contains: search, mode: 'insensitive' } },
        { documentDetails: { contains: search, mode: 'insensitive' } },
      ]
    }
    
    const [assets, total] = await prisma.$transaction([
      prisma.asset.findMany({
        where,
        include: {
          mol: true,
          group: true,
          _count: {
            select: { operations: true },
          },
        },
        orderBy: { orderNumber: 'asc' },
        skip,
        take: limit,
      }),
      prisma.asset.count({ where }),
    ])
    
    return NextResponse.json({
      data: assets,
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error('Error fetching assets:', error)
    return NextResponse.json(
      { error: 'Ошибка при загрузке имущества' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = validateRequest(createAssetSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const data = validation.data
    const totalCost = Number(data.unitPrice) * Number(data.quantity)
    
    const asset = await prisma.asset.create({
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
        isExistingAsset: data.isExistingAsset || false,
        recordingDate: new Date(data.recordingDate),
        documentType: data.documentType,
        documentDetails: data.documentDetails,
        documentFiles: data.documentFiles || [],
        status: data.status || 'IN_STOCK',
        notes: data.notes,
        plannedDisposalDate: data.plannedDisposalDate ? new Date(data.plannedDisposalDate) : null,
        plannedDisposalReason: data.plannedDisposalReason,
        photos: data.photos || [],
        accountingForm: data.accountingForm || '145',
      },
      include: {
        mol: true,
        group: true,
      },
    })
    
    // Create initial receipt operation
    await prisma.operation.create({
      data: {
        type: OperationType.RECEIPT,
        assetId: asset.id,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        totalCost,
        date: new Date(data.recordingDate),
        reason: 'Первоначальное поступление',
        documentType: data.documentType,
        documentDetails: data.documentDetails,
        documentFiles: data.documentFiles || [],
      },
    })
    
    return NextResponse.json(asset, { status: 201 })
  } catch (error) {
    console.error('Error creating asset:', error)
    return NextResponse.json(
      { error: 'Ошибка при создании объекта имущества' },
      { status: 500 }
    )
  }
}