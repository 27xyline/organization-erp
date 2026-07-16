export class ServiceError<TCode extends string = string> extends Error {
  readonly code: TCode

  constructor(code: TCode) {
    super(code)
    this.name = 'ServiceError'
    this.code = code
  }
}

export const isServiceError = <TCode extends string = string>(
  error: unknown,
  code?: TCode
): error is ServiceError<TCode> => {
  if (!(error instanceof ServiceError)) {
    return false
  }

  return code ? error.code === code : true
}
