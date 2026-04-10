import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ServiceError } from '@/lib/services/service-error'

export type ProjectMemberErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_DISMISSED'
  | 'PROJECT_MEMBER_NOT_FOUND'

export const projectMemberError = (code: ProjectMemberErrorCode) => new ServiceError(code)

const buildSnapshot = (employee: {
  department: string
  employmentRate: Prisma.Decimal | number
  staffSchedule?: {
    department: string
    position: string
    salary: Prisma.Decimal | number
  } | null
}) => {
  const rate = Number(employee.employmentRate ?? 0).toFixed(2)
  const salary = (
    Number(employee.staffSchedule?.salary ?? 0) * Number(employee.employmentRate ?? 0)
  ).toFixed(2)

  return {
    department: employee.staffSchedule?.department || employee.department || '—',
    position: employee.staffSchedule?.position || '—',
    rate,
    salary,
  }
}

const mapMember = (member: {
  id: string
  projectId: string
  employeeId: string
  department: string
  position: string
  rate: Prisma.Decimal | number
  salary: Prisma.Decimal | number
  isArchived: boolean
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  employee: {
    id: string
    code: string
    fullName: string
    department: string
    employmentRate: Prisma.Decimal | number
    status: string
    staffSchedule?: {
      id: string
      position: string
      department: string
      salary: Prisma.Decimal | number
    } | null
  }
}) => ({
  id: member.id,
  projectId: member.projectId,
  employeeId: member.employeeId,
  department: member.department,
  position: member.position,
  rate: Number(member.rate).toFixed(2),
  salary: Number(member.salary).toFixed(2),
  isArchived: member.isArchived,
  archivedAt: member.archivedAt,
  createdAt: member.createdAt,
  updatedAt: member.updatedAt,
  employee: {
    id: member.employee.id,
    code: member.employee.code,
    fullName: member.employee.fullName,
    department: member.employee.department,
    employmentRate: Number(member.employee.employmentRate ?? 0).toFixed(2),
    status: member.employee.status,
    staffSchedule: member.employee.staffSchedule
      ? {
          id: member.employee.staffSchedule.id,
          position: member.employee.staffSchedule.position,
          department: member.employee.staffSchedule.department,
          salary: Number(member.employee.staffSchedule.salary).toFixed(2),
        }
      : null,
  },
})

const mapAvailableEmployee = (employee: {
  id: string
  code: string
  fullName: string
  department: string
  employmentRate: Prisma.Decimal | number
  staffSchedule?: {
    id: string
    position: string
    department: string
    salary: Prisma.Decimal | number
  } | null
}) => ({
  id: employee.id,
  code: employee.code,
  fullName: employee.fullName,
  department: employee.staffSchedule?.department || employee.department || '—',
  position: employee.staffSchedule?.position || '—',
  rate: Number(employee.employmentRate ?? 0).toFixed(2),
  salary: (
    Number(employee.staffSchedule?.salary ?? 0) * Number(employee.employmentRate ?? 0)
  ).toFixed(2),
})

export const getProjectMemberErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) {
    return null
  }

  switch (error.code) {
    case 'PROJECT_NOT_FOUND':
      return { status: 404, error: 'Проект не найден' }
    case 'EMPLOYEE_NOT_FOUND':
      return { status: 404, error: 'Сотрудник не найден' }
    case 'EMPLOYEE_DISMISSED':
      return { status: 400, error: 'Нельзя добавить уволенного сотрудника' }
    case 'PROJECT_MEMBER_NOT_FOUND':
      return { status: 404, error: 'Участник проекта не найден' }
    default:
      return null
  }
}

export class ProjectMemberService {
  static async getMembers(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    })

    if (!project) {
      throw projectMemberError('PROJECT_NOT_FOUND')
    }

    const [members, employees] = await prisma.$transaction([
      prisma.projectMember.findMany({
        where: {
          projectId,
          isArchived: false,
        },
        include: {
          employee: {
            select: {
              id: true,
              code: true,
              fullName: true,
              department: true,
              employmentRate: true,
              status: true,
              staffSchedule: {
                select: {
                  id: true,
                  position: true,
                  department: true,
                  salary: true,
                },
              },
            },
          },
        },
        orderBy: [
          { department: 'asc' },
          { employee: { fullName: 'asc' } },
        ],
      }),
      prisma.employee.findMany({
        where: {
          status: {
            not: 'DISMISSED',
          },
        },
        include: {
          staffSchedule: {
            select: {
              id: true,
              position: true,
              department: true,
              salary: true,
            },
          },
          projectMembers: {
            where: {
              projectId,
              isArchived: false,
            },
            select: {
              id: true,
            },
          },
        },
        orderBy: [
          { fullName: 'asc' },
        ],
      }),
    ])

    return {
      members: members.map(mapMember),
      availableEmployees: employees
        .filter((employee) => employee.projectMembers.length === 0)
        .map((employee) => mapAvailableEmployee(employee)),
    }
  }

  static async addMember(projectId: string, employeeId: string) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      })

      if (!project) {
        throw projectMemberError('PROJECT_NOT_FOUND')
      }

      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
        include: {
          staffSchedule: {
            select: {
              id: true,
              position: true,
              department: true,
              salary: true,
            },
          },
        },
      })

      if (!employee) {
        throw projectMemberError('EMPLOYEE_NOT_FOUND')
      }

      if (employee.status === 'DISMISSED') {
        throw projectMemberError('EMPLOYEE_DISMISSED')
      }

      const snapshot = buildSnapshot(employee)
      const existing = await tx.projectMember.findUnique({
        where: {
          projectId_employeeId: {
            projectId,
            employeeId,
          },
        },
      })

      const member = existing
        ? await tx.projectMember.update({
            where: { id: existing.id },
            data: {
              department: snapshot.department,
              position: snapshot.position,
              rate: new Prisma.Decimal(snapshot.rate),
              salary: new Prisma.Decimal(snapshot.salary),
              isArchived: false,
              archivedAt: null,
            },
            include: {
              employee: {
                select: {
                  id: true,
                  code: true,
                  fullName: true,
                  department: true,
                  employmentRate: true,
                  status: true,
                  staffSchedule: {
                    select: {
                      id: true,
                      position: true,
                      department: true,
                      salary: true,
                    },
                  },
                },
              },
            },
          })
        : await tx.projectMember.create({
            data: {
              projectId,
              employeeId,
              department: snapshot.department,
              position: snapshot.position,
              rate: new Prisma.Decimal(snapshot.rate),
              salary: new Prisma.Decimal(snapshot.salary),
            },
            include: {
              employee: {
                select: {
                  id: true,
                  code: true,
                  fullName: true,
                  department: true,
                  employmentRate: true,
                  status: true,
                  staffSchedule: {
                    select: {
                      id: true,
                      position: true,
                      department: true,
                      salary: true,
                    },
                  },
                },
              },
            },
          })

      return mapMember(member)
    })
  }

  static async updateMember(projectId: string, memberId: string, isArchived: boolean) {
    const member = await prisma.projectMember.findFirst({
      where: {
        id: memberId,
        projectId,
      },
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            department: true,
            employmentRate: true,
            status: true,
            staffSchedule: {
              select: {
                id: true,
                position: true,
                department: true,
                salary: true,
              },
            },
          },
        },
      },
    })

    if (!member) {
      throw projectMemberError('PROJECT_MEMBER_NOT_FOUND')
    }

    const updated = await prisma.projectMember.update({
      where: { id: memberId },
      data: {
        isArchived,
        archivedAt: isArchived ? new Date() : null,
      },
      include: {
        employee: {
          select: {
            id: true,
            code: true,
            fullName: true,
            department: true,
            employmentRate: true,
            status: true,
            staffSchedule: {
              select: {
                id: true,
                position: true,
                department: true,
                salary: true,
              },
            },
          },
        },
      },
    })

    return mapMember(updated)
  }
}
