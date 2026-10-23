import { BackendRequestError } from './client'

export interface BackendPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface BackendList<T> {
  data: T[]
  pagination: BackendPagination
}

/** Read a `{data: ...}` response for a server-rendered page. */
export async function readBackendData<T>(response: Response, message: string): Promise<T> {
  if (!response.ok) throw new BackendRequestError(message, response.status)
  try {
    const envelope = await response.json() as { data?: T }
    if (!Object.hasOwn(envelope, 'data')) throw new Error('Missing data envelope')
    return envelope.data as T
  } catch (cause) {
    throw new BackendRequestError(message, 502, cause)
  }
}

export async function readBackendList<T>(response: Response, message: string): Promise<BackendList<T>> {
  if (!response.ok) throw new BackendRequestError(message, response.status)
  try {
    const envelope = await response.json() as Partial<BackendList<T>>
    const pagination = envelope.pagination
    if (
      !Array.isArray(envelope.data)
      || !pagination
      || ![pagination.page, pagination.pageSize, pagination.total, pagination.totalPages]
        .every((value) => Number.isSafeInteger(value) && value >= 0)
      || pagination.page < 1
      || pagination.pageSize < 1
    ) {
      throw new Error('Invalid list envelope')
    }
    return { data: envelope.data, pagination }
  } catch (cause) {
    throw new BackendRequestError(message, 502, cause)
  }
}
