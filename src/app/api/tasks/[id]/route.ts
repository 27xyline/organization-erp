import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { updateTaskSchema } from '@/lib/schemas/task'
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

// PUT /api/tasks/[id] - Update task
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json()
    const validation = validateRequest(updateTaskSchema, data)

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      )
    }

    const existingTask = await prisma.task.findUnique({
      where: { id: params.id },
      select: { id: true, projectId: true },
    })

    if (!existingTask) {
      return NextResponse.json(
        { error: 'Задача не найдена' },
        { status: 404 }
      )
    }

    const assigneeMembers = validation.data.employeeIds
      ? await getActiveAssigneeMembers(existingTask.projectId, validation.data.employeeIds)
      : null

    if (validation.data.employeeIds && assigneeMembers && assigneeMembers.length !== validation.data.employeeIds.length) {
      return NextResponse.json(
        { error: 'Можно назначать только активных участников проекта' },
        { status: 400 }
      )
    }
    
    const task = await prisma.task.update({
      where: { id: params.id },
      data: {
        name: validation.data.name,
        startDate: validation.data.startDate !== undefined
          ? (validation.data.startDate ? new Date(validation.data.startDate) : null)
          : undefined,
        endDate: validation.data.endDate !== undefined
          ? (validation.data.endDate ? new Date(validation.data.endDate) : null)
          : undefined,
        duration: validation.data.duration,
        progress: validation.data.progress,
        responsible: validation.data.employeeIds
          ? (assigneeMembers && assigneeMembers.length > 0
              ? assigneeMembers.map((member) => member.employee.fullName).join('\n')
              : null)
          : undefined,
        status: validation.data.status,
        assignees: validation.data.employeeIds
          ? {
              deleteMany: {},
              create: assigneeMembers?.map((member) => ({
                employeeId: member.employeeId,
                projectMemberId: member.id,
              })) ?? [],
            }
          : undefined,
      },
      include: taskAssigneeInclude,
    })
    
    return NextResponse.json(mapTaskResponse(task))
  } catch (error) {
    console.error('Error updating task:', error)
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    )
  }
}

// DELETE /api/tasks/[id] - Delete task
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.task.delete({
      where: { id: params.id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting task:', error)
    return NextResponse.json(
      { error: 'Failed to delete task' },
      { status: 500 }
    )
  }
}
