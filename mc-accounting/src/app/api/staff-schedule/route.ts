import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/staff-schedule - Get all staff schedule positions
export async function GET() {
  try {
    const positions = await prisma.staffSchedule.findMany({
      orderBy: [
        { position: 'asc' },
        { department: 'asc' },
      ],
      include: {
        employees: {
          where: {
            status: {
              not: 'DISMISSED',
            },
          },
        },
      },
    })
    
    return NextResponse.json(positions)
  } catch (error) {
    console.error('Error fetching staff schedule:', error)
    return NextResponse.json(
      { error: 'Failed to fetch staff schedule' },
      { status: 500 }
    )
  }
}

// POST /api/staff-schedule - Create new position
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    const position = await prisma.staffSchedule.create({
      data: {
        position: data.position,
        department: data.department,
        rate: data.rate || 1,
        salary: data.salary || 0,
      },
    })
    
    return NextResponse.json(position)
  } catch (error) {
    console.error('Error creating staff position:', error)
    return NextResponse.json(
      { error: 'Failed to create staff position' },
      { status: 500 }
    )
  }
}
