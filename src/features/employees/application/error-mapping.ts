import { ServiceError } from '@/lib/errors/service-error'

export const getEmployeeRouteErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) return null
  switch (error.code) {
    case 'POSITION_REQUIRED': return { status: 400, error: 'Должность из штатного расписания обязательна' }
    case 'POSITION_NOT_FOUND': return { status: 404, error: 'Должность из штатного расписания не найдена' }
    case 'EMPLOYEE_NOT_FOUND': return { status: 404, error: 'Сотрудник не найден' }
    case 'INSUFFICIENT_POSITION_RATE': return { status: 400, error: 'Недостаточно свободных ставок по выбранной должности' }
    case 'INVALID_EMPLOYMENT_RATE': return { status: 400, error: 'Количество ставок сотрудника должно быть больше нуля' }
    case 'INVALID_CONTRACT_DATE_RANGE': return { status: 400, error: 'Дата подписания договора должна быть раньше срока действия договора' }
    case 'INVALID_CONTRACT_DATE': return { status: 400, error: 'Некорректная дата договора' }
    default: return null
  }
}

export const getPersonnelActionRouteErrorMeta = (error: unknown) => {
  if (!(error instanceof ServiceError)) return null
  switch (error.code) {
    case 'EMPLOYEE_NOT_FOUND': return { status: 404, error: 'Сотрудник не найден' }
    case 'INVALID_HIRE_PAYLOAD': return { status: 400, error: 'Отсутствуют обязательные поля для приема на работу' }
    case 'POSITION_REQUIRED': return { status: 400, error: 'Должность из штатного расписания обязательна' }
    case 'POSITION_NOT_FOUND': return { status: 404, error: 'Должность из штатного расписания не найдена' }
    case 'INVALID_EMPLOYMENT_RATE': return { status: 400, error: 'Количество ставок сотрудника должно быть больше нуля' }
    case 'INSUFFICIENT_POSITION_RATE': return { status: 400, error: 'Недостаточно свободных ставок по выбранной должности' }
    case 'MISSING_EMPLOYEE_ID': return { status: 400, error: 'Сотрудник обязателен для этого действия' }
    case 'MISSING_CONTRACT_END_DATE': return { status: 400, error: 'Новая дата окончания контракта обязательна' }
    case 'INVALID_CONTRACT_DATE': return { status: 400, error: 'Некорректная дата договора' }
    case 'INVALID_ACTION_DATE': return { status: 400, error: 'Некорректная дата кадрового действия' }
    case 'INVALID_CONTRACT_DATE_RANGE': return { status: 400, error: 'Дата подписания договора должна быть раньше срока действия договора' }
    default: return null
  }
}
