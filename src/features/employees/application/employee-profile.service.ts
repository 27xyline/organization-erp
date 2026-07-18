import { getDb } from '@/lib/prisma'
import type { AccessContext } from '@/lib/auth/access-context'
import type { EmployeeProfileInput } from '../contracts/profile'

const iso = (value: Date | null | undefined) => value?.toISOString() || null

export class EmployeeProfileService {
  static async get(id: string, access: AccessContext) {
    const db = getDb()
    const [employee, managers, documents] = await Promise.all([
      db.employee.findFirst({
        where: { AND: [{ id }, access.employeeWhere('employees.read')] },
        include: {
          staffSchedule: true,
          manager: { select: { id: true, fullName: true } },
          directReports: {
            where: { status: { not: 'DISMISSED' } },
            select: { id: true, fullName: true, staffSchedule: { select: { position: true } } },
            orderBy: { fullName: 'asc' },
          },
          skills: { orderBy: { name: 'asc' } },
          certificates: { orderBy: [{ expiresAt: 'asc' }, { name: 'asc' }] },
          actions: { orderBy: { date: 'desc' }, take: 30 },
          salaryEntries: { orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 24 },
          projectMembers: {
            where: { isArchived: false },
            include: {
              project: { select: { id: true, code: true, name: true, status: true } },
              _count: { select: { taskAssignees: true } },
            },
            orderBy: { project: { name: 'asc' } },
          },
          vacations: { orderBy: { startDate: 'desc' }, take: 12 },
          mol: {
            select: {
              id: true,
              code: true,
              storageLocation: true,
              assets: {
                where: { isArchived: false },
                select: {
                  id: true,
                  name: true,
                  inventoryNumber: true,
                  status: true,
                  quantity: true,
                  totalCost: true,
                },
                orderBy: { name: 'asc' },
              },
            },
          },
        },
      }),
      db.employee.findMany({
        where: {
          AND: [
            { id: { not: id }, status: { not: 'DISMISSED' } },
            access.employeeWhere('employees.read'),
          ],
        },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      }),
      access.has('documents.read')
        ? db.document.findMany({
            where: {
              AND: [
                { employeeId: id, archivedAt: null },
                access.documentWhere('documents.read'),
              ],
            },
            select: {
              id: true,
              title: true,
              category: true,
              status: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
          })
        : [],
    ])
    if (!employee) return null

    return {
      employee: {
        id: employee.id,
        code: employee.code,
        fullName: employee.fullName,
        department: employee.department,
        departmentId: employee.departmentId,
        phone: employee.phone,
        email: employee.email,
        birthDate: iso(employee.birthDate),
        education: employee.education,
        qualification: employee.qualification,
        status: employee.status,
        contractType: employee.contractType,
        contractSignedDate: iso(employee.contractSignedDate),
        contractEndDate: iso(employee.contractEndDate),
        contractNumber: employee.contractNumber,
        employmentRate: Number(employee.employmentRate),
        staffSchedule: employee.staffSchedule && {
          id: employee.staffSchedule.id,
          position: employee.staffSchedule.position,
          salary: Number(employee.staffSchedule.salary),
        },
        manager: employee.manager,
        directReports: employee.directReports,
        skills: employee.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          level: skill.level,
        })),
        certificates: employee.certificates.map((certificate) => ({
          id: certificate.id,
          name: certificate.name,
          issuer: certificate.issuer,
          number: certificate.number,
          issuedAt: iso(certificate.issuedAt),
          expiresAt: iso(certificate.expiresAt),
        })),
        personnelActions: employee.actions.map((action) => ({
          ...action,
          date: iso(action.date)!,
          createdAt: iso(action.createdAt)!,
          oldContractEndDate: iso(action.oldContractEndDate),
          newContractEndDate: iso(action.newContractEndDate),
        })),
        salaryEntries: employee.salaryEntries.map((entry) => ({
          id: entry.id,
          year: entry.year,
          month: entry.month,
          amount: Number(entry.amount),
        })),
        projects: employee.projectMembers.map((member) => ({
          id: member.id,
          department: member.department,
          position: member.position,
          rate: Number(member.rate),
          salary: Number(member.salary),
          taskCount: member._count.taskAssignees,
          project: member.project,
        })),
        vacations: employee.vacations.map((vacation) => ({
          id: vacation.id,
          type: vacation.type,
          startDate: iso(vacation.startDate)!,
          endDate: iso(vacation.endDate)!,
        })),
        mol: employee.mol && {
          id: employee.mol.id,
          code: employee.mol.code,
          storageLocation: employee.mol.storageLocation,
          assets: employee.mol.assets.map((asset) => ({
            ...asset,
            quantity: Number(asset.quantity),
            totalCost: Number(asset.totalCost),
          })),
        },
        documents: documents.map((document) => ({
          ...document,
          updatedAt: document.updatedAt.toISOString(),
        })),
      },
      managers,
    }
  }

  static async update(
    id: string,
    input: EmployeeProfileInput,
    actorId: string,
    requestId?: string,
  ) {
    const db = getDb()
    return db.$transaction(async (tx) => {
      const current = await tx.employee.findUnique({
        where: { id },
        select: { id: true, managerId: true },
      })
      if (!current) throw new Error('EMPLOYEE_NOT_FOUND')
      if (input.managerId === id) throw new Error('INVALID_MANAGER')
      if (input.managerId) {
        const manager = await tx.employee.findFirst({
          where: { id: input.managerId, status: { not: 'DISMISSED' } },
          select: { id: true, managerId: true },
        })
        if (!manager || manager.managerId === id) throw new Error('INVALID_MANAGER')
      }

      const employee = await tx.employee.update({
        where: { id },
        data: {
          birthDate: input.birthDate ? new Date(input.birthDate) : null,
          education: input.education || null,
          qualification: input.qualification || null,
          managerId: input.managerId || null,
        },
      })
      await Promise.all([
        tx.employeeSkill.deleteMany({ where: { employeeId: id } }),
        tx.employeeCertificate.deleteMany({ where: { employeeId: id } }),
      ])
      await Promise.all([
        input.skills.length
          ? tx.employeeSkill.createMany({
              data: input.skills.map((skill) => ({
                employeeId: id,
                name: skill.name,
                level: skill.level || null,
              })),
            })
          : Promise.resolve(),
        input.certificates.length
          ? tx.employeeCertificate.createMany({
              data: input.certificates.map((certificate) => ({
                employeeId: id,
                name: certificate.name,
                issuer: certificate.issuer || null,
                number: certificate.number || null,
                issuedAt: certificate.issuedAt ? new Date(certificate.issuedAt) : null,
                expiresAt: certificate.expiresAt ? new Date(certificate.expiresAt) : null,
              })),
            })
          : Promise.resolve(),
        tx.auditLog.create({
          data: {
            userId: actorId,
            requestId,
            action: 'EMPLOYEE_PROFILE_UPDATE',
            entityType: 'Employee',
            entityId: id,
            details: {
              managerChanged: current.managerId !== (input.managerId || null),
              skills: input.skills.length,
              certificates: input.certificates.length,
            },
          },
        }),
      ])
      return employee
    })
  }
}
