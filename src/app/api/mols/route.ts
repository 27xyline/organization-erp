import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createMolSchema, validateRequest } from '@/lib/validations'

export async function GET() {
  try {
    const mols = await prisma.mol.findMany({
      orderBy: { code: 'asc' },
    })
    return NextResponse.json(mols)
  } catch (error) {
    console.error('Error fetching MOLs:', error)
    return NextResponse.json(
      { error: 'Ошибка при загрузке данных МОЛ' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = validateRequest(createMolSchema, body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const data = validation.data
    
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
      { error: 'Ошибка при создании МОЛ' },
      { status: 500 }
    )
  }
}