import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/employees - Get all employees
export async function GET() {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        staffSchedule: true,
      },
    })
    
    return NextResponse.json(employees)
  } catch (error) {
    console.error('Error fetching employees:', error)
    return NextResponse.json(
      { error: 'Failed to fetch employees' },
      { status: 500 }
    )
  }
}

// POST /api/employees - Create new employee
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    const employee = await prisma.employee.create({
      data: {
        code: data.code,
        fullName: data.fullName,
        department: data.department,
        photo: data.photo,
        phone: data.phone,
        email: data.email,
        staffScheduleId: data.staffScheduleId || null,
        status: data.status || 'ACTIVE',
      },
      include: {
        staffSchedule: true,
      },
    })
    
    return NextResponse.json(employee)
  } catch (error) {
    console.error('Error creating employee:', error)
    return NextResponse.json(
      { error: 'Failed to create employee' },
      { status: 500 }
    )
  }
}
