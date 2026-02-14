import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const mol = await prisma.mol.findUnique({
      where: { id: params.id },
      include: {
        assets: true,
      },
    })
    
    if (!mol) {
      return NextResponse.json(
        { error: 'MOL not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(mol)
  } catch (error) {
    console.error('Error fetching MOL:', error)
    return NextResponse.json(
      { error: 'Failed to fetch MOL' },
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
    
    const mol = await prisma.mol.update({
      where: { id: params.id },
      data: {
        code: data.code,
        department: data.department,
        fullName: data.fullName,
        storageLocation: data.storageLocation,
        photo: data.photo,
      },
    })
    
    return NextResponse.json(mol)
  } catch (error) {
    console.error('Error updating MOL:', error)
    return NextResponse.json(
      { error: 'Failed to update MOL' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.mol.delete({
      where: { id: params.id },
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting MOL:', error)
    return NextResponse.json(
      { error: 'Failed to delete MOL' },
      { status: 500 }
    )
  }
}