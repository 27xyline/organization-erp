import { getDb } from '@/lib/prisma'
import { employeeSelect } from '../infrastructure/employee.repository'
import {
  normalizeEmployee,
  normalizePersonnelAction,
  normalizeStaffSchedule,
  normalizeVacation,
} from '../contracts/normalizers'
import type { AccessContext } from '@/lib/auth/access-context'

export class EmployeeReadService {
  static async dashboard(year: number, access?: AccessContext) {
    const db = getDb()
    const startOfYear = new Date(year, 0, 1)
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999)
    const [employees, positions, departments, vacations, actions] = await Promise.all([
      db.employee.findMany({
        where: {
          AND: [
            { status: { not: 'DISMISSED' } },
            access?.employeeWhere('employees.read') || {},
          ],
        },
        orderBy: { fullName: 'asc' },
        include: {
          staffSchedule: {
            include: { departmentRef: { select: { isActive: true } } },
          },
        },
      }),
      db.staffSchedule.findMany({
        where: access?.allowedDepartmentIds('staffSchedule.read') === null ||
          access?.allowedDepartmentIds('staffSchedule.read') === undefined
          ? undefined
          : { departmentId: { in: access.allowedDepartmentIds('staffSchedule.read') || [] } },
        orderBy: [{ department: 'asc' }, { position: 'asc' }],
        include: {
          employees: {
            where: { status: { not: 'DISMISSED' } },
            include: {
              staffSchedule: {
                include: { departmentRef: { select: { isActive: true } } },
              },
            },
          },
          departmentRef: { select: { isActive: true } },
        },
      }),
      db.department.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true, isActive: true },
      }),
      db.vacation.findMany({
        where: {
          AND: [
            { startDate: { lte: endOfYear }, endDate: { gte: startOfYear } },
            access ? { employee: access.employeeWhere('vacations.read') } : {},
          ],
        },
        orderBy: { startDate: 'asc' },
        include: { employee: { select: { id: true, fullName: true, department: true } } },
      }),
      db.personnelAction.findMany({
        where: access ? { employee: access.employeeWhere('personnelActions.read') } : undefined,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { employee: { select: employeeSelect } },
      }),
    ])

    return {
      employees: employees.map(normalizeEmployee),
      staffSchedule: positions.map(normalizeStaffSchedule),
      departments,
      vacations: vacations.map(normalizeVacation),
      personnelActions: actions.map(normalizePersonnelAction),
    }
  }
}
