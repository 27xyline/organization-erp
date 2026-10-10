import { BackendRequestError } from './client'

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
