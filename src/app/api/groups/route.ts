import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createGroupSchema, validateRequest } from '@/lib/validations'

export async function GET() {
  try {
    const groups = await prisma.assetGroup.findMany({
      orderBy: { code: 'asc' },
    })
    return NextResponse.json(groups)
  } catch (error) {
    console.error('Error fetching asset groups:', error)
    return NextResponse.json(
      { error: 'Ошибка при загрузке групп имущества' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = validateRequest(createGroupSchema, body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const data = validation.data
    
    const group = await prisma.assetGroup.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
      },
    })
    
    return NextResponse.json(group, { status: 201 })
  } catch (error) {
    console.error('Error creating asset group:', error)
    return NextResponse.json(
      { error: 'Ошибка при создании группы имущества' },
      { status: 500 }
    )
  }
}