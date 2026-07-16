import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/projects/[id] - Get project with tasks
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        tasksList: {
          orderBy: { createdAt: 'asc' },
          include: {
            children: {
              include: {
                children: true
              }
            }
          }
        },
        assets: {
          include: {
            mol: true,
            group: true,
          }
        },
        _count: {
          select: { assets: true, tasksList: true }
        }
      }
    })
    
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(project)
  } catch (error) {
    console.error('Error fetching project:', error)
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    )
  }
}

// PUT /api/projects/[id] - Update project
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    
    const project = await prisma.project.update({
      where: { id: params.id },
      data: {
        name: data.name,
        description: data.description || null,
        goals: data.goals || null,
        tasks: data.tasks || null,
        results: data.results || null,
        startDate: data.startDate && data.startDate.trim() !== '' ? new Date(data.startDate) : null,
        endDate: data.endDate && data.endDate.trim() !== '' ? new Date(data.endDate) : null,
        plannedBudget: data.plannedBudget || 0,
        actualBudget: data.actualBudget || 0,
        status: data.status,
      }
    })
    
    return NextResponse.json(project)
  } catch (error) {
    console.error('Error updating project:', error)
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.project.delete({
      where: { id: params.id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting project:', error)
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    )
  }
}
