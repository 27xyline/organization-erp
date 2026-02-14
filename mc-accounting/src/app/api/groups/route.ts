import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const groups = await prisma.assetGroup.findMany({
      orderBy: { code: 'asc' },
    })
    return NextResponse.json(groups)
  } catch (error) {
    console.error('Error fetching asset groups:', error)
    return NextResponse.json(
      { error: 'Failed to fetch asset groups' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
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
      { error: 'Failed to create asset group' },
      { status: 500 }
    )
  }
}