import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/projects/[id]/tasks - Get all tasks for project
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tasks = await prisma.task.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: 'asc' },
      include: {
        children: {
          include: {
            children: true
          }
        }
      }
    })
    
    return NextResponse.json(tasks)
  } catch (error) {
    console.error('Error fetching tasks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    )
  }
}

// POST /api/projects/[id]/tasks - Create new task
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    
    const task = await prisma.task.create({
      data: {
        name: data.name,
        level: data.level || 1,
        parentId: data.parentId || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        duration: data.duration,
        progress: data.progress || 0,
        responsible: data.responsible,
        status: data.status || 'NOT_STARTED',
        projectId: params.id,
      }
    })
    
    return NextResponse.json(task)
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    )
  }
}
