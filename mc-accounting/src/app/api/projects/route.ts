import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createProjectSchema, validateRequest } from '@/lib/validations'

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
      { error: 'Ошибка при загрузке проектов' },
      { status: 500 }
    )
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Generate code if not provided so it passes validation if missing from client
    if (!body.code) {
      body.code = `PRJ-${Date.now()}`
    }
    
    const validation = validateRequest(createProjectSchema, body)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const data = validation.data
    
    const project = await prisma.project.create({
      data: {
        code: data.code,
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
      { error: 'Ошибка при создании проекта' },
      { status: 500 }
    )
  }
}
