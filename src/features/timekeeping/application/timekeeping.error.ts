export type TimekeepingErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_REFERENCE'
  | 'DAILY_HOURS_EXCEEDED'
  | 'PERIOD_CLOSED'
  | 'TIMESHEET_LOCKED'
  | 'TIMESHEET_STATE_INVALID'
  | 'ZERO_HOURS_CONFIRMATION_REQUIRED'
  | 'TIMESHEET_DECISION_FORBIDDEN'
  | 'CORRECTION_REASON_REQUIRED'
  | 'APPROVAL_REASON_REQUIRED'
  | 'PAYROLL_TIMESHEETS_PENDING'

export class TimekeepingError extends Error {
  constructor(readonly code: TimekeepingErrorCode) {
    super(code)
    this.name = 'TimekeepingError'
  }
}
