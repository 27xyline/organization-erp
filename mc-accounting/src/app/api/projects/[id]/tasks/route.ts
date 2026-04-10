import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createTaskSchema } from '@/lib/schemas/task'
import { validateRequest } from '@/lib/validations'

const taskAssigneeInclude = {
  assignees: {
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
        },
      },
      projectMember: {
        select: {
          id: true,
        },
      },
    },
  },
} as const

const nestedTaskInclude = {
  ...taskAssigneeInclude,
  children: {
    include: {
      ...taskAssigneeInclude,
      children: {
        include: taskAssigneeInclude,
      },
    },
  },
} as const

const mapTaskResponse = <
  TTask extends {
    assignees: Array<{
      employeeId: string
      projectMemberId: string | null
      employee: {
        fullName: string
      }
    }>
  }
>(task: TTask) => ({
  ...task,
  assignees: task.assignees.map((assignee) => ({
    employeeId: assignee.employeeId,
    fullName: assignee.employee.fullName,
    projectMemberId: assignee.projectMemberId,
  })),
})

async function getActiveAssigneeMembers(projectId: string, employeeIds: string[]) {
  if (employeeIds.length === 0) {
    return []
  }

  const members = await prisma.projectMember.findMany({
    where: {
      projectId,
      isArchived: false,
      employeeId: {
        in: employeeIds,
      },
    },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  })

  const byEmployeeId = new Map(members.map((member) => [member.employeeId, member]))

  return employeeIds.flatMap((employeeId) => {
    const member = byEmployeeId.get(employeeId)
    return member ? [member] : []
  })
}

// GET /api/projects/[id]/tasks - Get all tasks for project
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tasks = await prisma.task.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: 'asc' },
      include: nestedTaskInclude,
    })
    
    return NextResponse.json(tasks.map((task) => mapTaskResponse(task)))
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
    const validation = validateRequest(createTaskSchema, data)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const assigneeMembers = await getActiveAssigneeMembers(params.id, validation.data.employeeIds)

    if (assigneeMembers.length !== validation.data.employeeIds.length) {
      return NextResponse.json(
        { error: 'Можно назначать только активных участников проекта' },
        { status: 400 }
      )
    }
    
    const task = await prisma.task.create({
      data: {
        name: validation.data.name,
        level: validation.data.level,
        parentId: validation.data.parentId || null,
        startDate: validation.data.startDate ? new Date(validation.data.startDate) : null,
        endDate: validation.data.endDate ? new Date(validation.data.endDate) : null,
        duration: validation.data.duration,
        progress: validation.data.progress,
        responsible: assigneeMembers.length > 0
          ? assigneeMembers.map((member) => member.employee.fullName).join('\n')
          : null,
        status: validation.data.status,
        projectId: params.id,
        assignees: assigneeMembers.length > 0 ? {
          create: assigneeMembers.map((member) => ({
            employeeId: member.employeeId,
            projectMemberId: member.id,
          })),
        } : undefined,
      },
      include: taskAssigneeInclude,
    })
    
    return NextResponse.json(mapTaskResponse(task))
  } catch (error) {
    console.error('Error creating task:', error)
    return NextResponse.json(
      { error: 'Failed to create task' },
      { status: 500 }
    )
  }
}
