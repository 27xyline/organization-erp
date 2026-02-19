import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/projects - List all projects
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { assets: true, tasksList: true }
        }
      }
    })
    
    return NextResponse.json(projects)
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Generate code if not provided
    const code = data.code || `PRJ-${Date.now()}`
    
    const project = await prisma.project.create({
      data: {
        code,
        name: data.name,
        description: data.description || null,
        goals: data.goals || null,
        tasks: data.tasks || null,
        results: data.results || null,
        startDate: data.startDate && data.startDate.trim() !== '' ? new Date(data.startDate) : null,
        endDate: data.endDate && data.endDate.trim() !== '' ? new Date(data.endDate) : null,
        plannedBudget: data.plannedBudget || 0,
        actualBudget: data.actualBudget || 0,
        status: data.status || 'ACTIVE',
      }
    })
    
    return NextResponse.json(project)
  } catch (error) {
    console.error('Error creating project:', error)
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    )
  }
}
