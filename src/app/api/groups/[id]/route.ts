import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const group = await prisma.assetGroup.findUnique({
      where: { id: params.id },
      include: {
        assets: true,
      },
    })
    
    if (!group) {
      return NextResponse.json(
        { error: 'Asset group not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(group)
  } catch (error) {
    console.error('Error fetching asset group:', error)
    return NextResponse.json(
      { error: 'Failed to fetch asset group' },
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
    
    const group = await prisma.assetGroup.update({
      where: { id: params.id },
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
      },
    })
    
    return NextResponse.json(group)
  } catch (error) {
    console.error('Error updating asset group:', error)
    return NextResponse.json(
      { error: 'Failed to update asset group' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.assetGroup.delete({
      where: { id: params.id },
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting asset group:', error)
    return NextResponse.json(
      { error: 'Failed to delete asset group' },
      { status: 500 }
    )
  }
}