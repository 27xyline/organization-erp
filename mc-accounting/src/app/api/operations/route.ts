import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { OperationType, AssetStatus } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const assetId = searchParams.get('assetId')
    const type = searchParams.get('type')
    
    const where: any = {}
    
    if (assetId) where.assetId = assetId
    if (type) where.type = type
    
    const operations = await prisma.operation.findMany({
      where,
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
    
    return NextResponse.json(operations)
  } catch (error) {
    console.error('Error fetching operations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch operations' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    const operation = await prisma.$transaction(async (tx) => {
      const totalCost = Number(data.unitPrice) * Number(data.quantity)
      
      // Create the operation
      const newOperation = await tx.operation.create({
        data: {
          type: data.type,
          assetId: data.assetId,
          fromMolId: data.fromMolId,
          toMolId: data.toMolId,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          totalCost,
          date: new Date(data.date),
          reason: data.reason,
          documentType: data.documentType,
          documentDetails: data.documentDetails,
          documentFiles: data.documentFiles || [],
          oldStatus: data.oldStatus,
          newStatus: data.newStatus,
        },
      })
      
      // Update asset based on operation type
      const asset = await tx.asset.findUnique({
        where: { id: data.assetId },
      })
      
      if (!asset) {
        throw new Error('Asset not found')
      }
      
      if (data.type === OperationType.RECEIPT) {
        // Increase quantity
        const newQuantity = Number(asset.quantity) + Number(data.quantity)
        const newTotalCost = Number(asset.totalCost) + totalCost
        
        await tx.asset.update({
          where: { id: data.assetId },
          data: {
            quantity: newQuantity,
            totalCost: newTotalCost,
            status: AssetStatus.IN_STOCK,
          },
        })
      } else if (data.type === OperationType.DISPOSAL) {
        // Decrease quantity or archive
        const newQuantity = Number(asset.quantity) - Number(data.quantity)
        const newTotalCost = Number(asset.totalCost) - totalCost
        
        if (newQuantity <= 0) {
          // Fully disposed - archive
          await tx.asset.update({
            where: { id: data.assetId },
            data: {
              quantity: 0,
              totalCost: 0,
              status: AssetStatus.FULLY_DISPOSED,
              isArchived: true,
            },
          })
        } else {
          // Partially disposed
          await tx.asset.update({
            where: { id: data.assetId },
            data: {
              quantity: newQuantity,
              totalCost: newTotalCost,
              status: AssetStatus.PARTIALLY_DISPOSED,
            },
          })
        }
      } else if (data.type === OperationType.TRANSFER) {
        // Decrease from current MOL
        const newQuantity = Number(asset.quantity) - Number(data.quantity)
        const newTotalCost = Number(asset.totalCost) - totalCost
        
        if (newQuantity <= 0) {
          // Fully transferred - archive original
          await tx.asset.update({
            where: { id: data.assetId },
            data: {
              quantity: 0,
              totalCost: 0,
              status: AssetStatus.FULLY_DISPOSED,
              isArchived: true,
            },
          })
        } else {
          await tx.asset.update({
            where: { id: data.assetId },
            data: {
              quantity: newQuantity,
              totalCost: newTotalCost,
            },
          })
        }
        
        // Create new asset for recipient MOL
        await tx.asset.create({
          data: {
            name: asset.name,
            inventoryNumber: asset.inventoryNumber,
            unitPrice: data.unitPrice,
            unitOfMeasure: asset.unitOfMeasure,
            quantity: data.quantity,
            totalCost,
            molId: data.toMolId!,
            groupId: asset.groupId,
            contractCode: asset.contractCode,
            internalFundingCode: asset.internalFundingCode,
            isExistingAsset: true,
            recordingDate: new Date(),
            documentType: data.documentType,
            documentDetails: `Передача от ${asset.molId}: ${data.documentDetails}`,
            documentFiles: data.documentFiles || [],
            status: AssetStatus.IN_STOCK,
          },
        })
      } else if (data.type === OperationType.STATUS_CHANGE) {
        await tx.asset.update({
          where: { id: data.assetId },
          data: {
            status: data.newStatus,
          },
        })
      }
      
      return newOperation
    })
    
    return NextResponse.json(operation, { status: 201 })
  } catch (error) {
    console.error('Error creating operation:', error)
    return NextResponse.json(
      { error: 'Failed to create operation' },
      { status: 500 }
    )
  }
}