import { Prisma, PrismaClient } from '@prisma/client'
import { getStaffScheduleRateSummary } from '@/lib/employees'
import { ServiceError } from '@/lib/services/service-error'

type StaffScheduleDbClient = Pick<PrismaClient, 'employee' | 'staffSchedule'> | Prisma.TransactionClient

export type HrErrorCode =
  | 'EMPLOYEE_NOT_FOUND'
  | 'POSITION_NOT_FOUND'
  | 'POSITION_REQUIRED'
  | 'INVALID_EMPLOYMENT_RATE'
  | 'INSUFFICIENT_POSITION_RATE'
  | 'INVALID_ACTION_DATE'
  | 'INVALID_CONTRACT_DATE'
  | 'INVALID_CONTRACT_DATE_RANGE'
  | 'MISSING_EMPLOYEE_ID'
  | 'MISSING_CONTRACT_END_DATE'
  | 'INVALID_HIRE_PAYLOAD'

export const employeeSelect = {
  id: true,
  fullName: true,
  department: true,
  status: true,
  contractType: true,
  contractSignedDate: true,
  contractEndDate: true,
  contractNumber: true,
  staffScheduleId: true,
  employmentRate: true,
  staffSchedule: {
    select: {
      id: true,
      position: true,
      department: true,
    },
  },
} as const

export const hrError = (code: HrErrorCode) => new ServiceError(code)

export const parseRequiredDate = (value: unknown, invalidCode: HrErrorCode = 'INVALID_CONTRACT_DATE') => {
  const date = value instanceof Date ? value : new Date(String(value))

  if (Number.isNaN(date.getTime())) {
    throw hrError(invalidCode)
  }

  return date
}

export const parseOptionalDate = (value: unknown, invalidCode: HrErrorCode = 'INVALID_CONTRACT_DATE') => {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return parseRequiredDate(value, invalidCode)
}

export const ensureValidActionDate = (value: unknown) => parseRequiredDate(value, 'INVALID_ACTION_DATE')

export const ensureValidEmploymentRate = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw hrError('INVALID_EMPLOYMENT_RATE')
  }
}

export const ensureValidContractDateRange = (
  contractSignedDate?: Date | null,
  contractEndDate?: Date | null
) => {
  if (contractSignedDate && contractEndDate && contractSignedDate >= contractEndDate) {
    throw hrError('INVALID_CONTRACT_DATE_RANGE')
  }
}

export const ensurePositionRequired = (
  staffScheduleId: string | null | undefined,
  status: string | null | undefined
) => {
  if (!staffScheduleId && status !== 'DISMISSED') {
    throw hrError('POSITION_REQUIRED')
  }
}

export const resolveAssignablePosition = async (
  db: StaffScheduleDbClient,
  {
    staffScheduleId,
    employeeId,
    employmentRate,
    status,
  }: {
    staffScheduleId?: string | null
    employeeId?: string
    employmentRate: number
    status: string
  }
) => {
  ensurePositionRequired(staffScheduleId, status)

  if (!staffScheduleId) {
    return null
  }

  const position = await db.staffSchedule.findUnique({
    where: { id: staffScheduleId },
  })

  if (!position) {
    throw hrError('POSITION_NOT_FOUND')
  }

  const rateSummary = await getStaffScheduleRateSummary(db, staffScheduleId, employeeId)

  if (!rateSummary) {
    throw hrError('POSITION_NOT_FOUND')
  }

  if (status !== 'DISMISSED' && employmentRate > rateSummary.freeRate) {
    throw hrError('INSUFFICIENT_POSITION_RATE')
  }

  return position
}

export const getEmployeeRouteErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) {
    return null
  }

  switch (error.code) {
    case 'POSITION_REQUIRED':
      return { status: 400, error: 'Должность из штатного расписания обязательна' }
    case 'POSITION_NOT_FOUND':
      return { status: 404, error: 'Должность из штатного расписания не найдена' }
    case 'EMPLOYEE_NOT_FOUND':
      return { status: 404, error: 'Сотрудник не найден' }
    case 'INSUFFICIENT_POSITION_RATE':
      return { status: 400, error: 'Недостаточно свободных ставок по выбранной должности' }
    case 'INVALID_EMPLOYMENT_RATE':
      return { status: 400, error: 'Количество ставок сотрудника должно быть больше нуля' }
    case 'INVALID_CONTRACT_DATE_RANGE':
      return { status: 400, error: 'Дата подписания договора должна быть раньше срока действия договора' }
    case 'INVALID_CONTRACT_DATE':
      return { status: 400, error: 'Некорректная дата договора' }
    default:
      return null
  }
}

export const getPersonnelActionRouteErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) {
    return null
  }

  switch (error.code) {
    case 'EMPLOYEE_NOT_FOUND':
      return { status: 404, error: 'Сотрудник не найден' }
    case 'INVALID_HIRE_PAYLOAD':
      return { status: 400, error: 'Отсутствуют обязательные поля для приема на работу' }
    case 'POSITION_REQUIRED':
      return { status: 400, error: 'Должность из штатного расписания обязательна' }
    case 'POSITION_NOT_FOUND':
      return { status: 404, error: 'Должность из штатного расписания не найдена' }
    case 'INVALID_EMPLOYMENT_RATE':
      return { status: 400, error: 'Количество ставок сотрудника должно быть больше нуля' }
    case 'INSUFFICIENT_POSITION_RATE':
      return { status: 400, error: 'Недостаточно свободных ставок по выбранной должности' }
    case 'MISSING_EMPLOYEE_ID':
      return { status: 400, error: 'Сотрудник обязателен для этого действия' }
    case 'MISSING_CONTRACT_END_DATE':
      return { status: 400, error: 'Новая дата окончания контракта обязательна' }
    case 'INVALID_CONTRACT_DATE':
      return { status: 400, error: 'Некорректная дата договора' }
    case 'INVALID_ACTION_DATE':
      return { status: 400, error: 'Некорректная дата кадрового действия' }
    case 'INVALID_CONTRACT_DATE_RANGE':
      return { status: 400, error: 'Дата подписания договора должна быть раньше срока действия договора' }
    default:
      return null
  }
}
