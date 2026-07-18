import { getDb } from '@/lib/prisma'
import { employeeSelect } from '../infrastructure/employee.repository'
import {
  normalizeEmployee,
  normalizePersonnelAction,
  normalizeStaffSchedule,
  normalizeVacation,
} from '../contracts/normalizers'

export class EmployeeReadService {
  static async dashboard(year: number) {
    const db = getDb()
    const startOfYear = new Date(year, 0, 1)
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999)
    const [employees, positions, departments, vacations, actions] = await Promise.all([
      db.employee.findMany({
        where: { status: { not: 'DISMISSED' } },
        orderBy: { fullName: 'asc' },
        include: { staffSchedule: true },
      }),
      db.staffSchedule.findMany({
        orderBy: [{ department: 'asc' }, { position: 'asc' }],
        include: { employees: { where: { status: { not: 'DISMISSED' } } } },
      }),
      db.department.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, code: true, name: true },
      }),
      db.vacation.findMany({
        where: { startDate: { lte: endOfYear }, endDate: { gte: startOfYear } },
        orderBy: { startDate: 'asc' },
        include: { employee: { select: { id: true, fullName: true, department: true } } },
      }),
      db.personnelAction.findMany({
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
