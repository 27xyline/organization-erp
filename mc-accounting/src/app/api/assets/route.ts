import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { OperationType } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const molId = searchParams.get('molId')
    const groupId = searchParams.get('groupId')
    const status = searchParams.get('status')
    const accountingForm = searchParams.get('accountingForm')
    const isArchived = searchParams.get('isArchived') === 'true'
    const search = searchParams.get('search')
    
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
    
    const assets = await prisma.asset.findMany({
      where,
      include: {
        mol: true,
        group: true,
        operations: {
          orderBy: { date: 'desc' },
        },
      },
      orderBy: { orderNumber: 'asc' },
    })
    
    return NextResponse.json(assets)
  } catch (error) {
    console.error('Error fetching assets:', error)
    return NextResponse.json(
      { error: 'Failed to fetch assets' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
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
      { error: 'Failed to create asset' },
      { status: 500 }
    )
  }
}