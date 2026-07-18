import { ServiceError } from '@/lib/errors/service-error'

export type HrErrorCode =
  | 'EMPLOYEE_NOT_FOUND'
  | 'POSITION_NOT_FOUND'
  | 'POSITION_REQUIRED'
  | 'INVALID_EMPLOYMENT_RATE'
  | 'INSUFFICIENT_POSITION_RATE'
  | 'INACTIVE_POSITION_DEPARTMENT'
  | 'INVALID_ACTION_DATE'
  | 'INVALID_CONTRACT_DATE'
  | 'INVALID_CONTRACT_DATE_RANGE'
  | 'MISSING_EMPLOYEE_ID'
  | 'MISSING_CONTRACT_END_DATE'
  | 'INVALID_HIRE_PAYLOAD'

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
