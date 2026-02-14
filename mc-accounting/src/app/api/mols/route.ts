import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const mols = await prisma.mol.findMany({
      orderBy: { code: 'asc' },
    })
    return NextResponse.json(mols)
  } catch (error) {
    console.error('Error fetching MOLs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch MOLs' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    const mol = await prisma.mol.create({
      data: {
        code: data.code,
        department: data.department,
        fullName: data.fullName,
        storageLocation: data.storageLocation,
        photo: data.photo,
      },
    })
    
    return NextResponse.json(mol, { status: 201 })
  } catch (error) {
    console.error('Error creating MOL:', error)
    return NextResponse.json(
      { error: 'Failed to create MOL' },
      { status: 500 }
    )
  }
}