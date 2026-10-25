'use client'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

export function requestWithCsrfHeader(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  cookieString: string,
  pageOrigin: string,
): { input: RequestInfo | URL; init: RequestInit } {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (SAFE_METHODS.has(method)) return { input, init: { ...init, headers } }

  try {
    const url = input instanceof Request ? new URL(input.url) : new URL(input.toString(), pageOrigin)
    if (url.origin !== pageOrigin || headers.has('x-csrf-token')) {
      return { input, init: { ...init, headers } }
    }
    const token = cookieString.match(/(?:^|;\s*)erp_csrf=([^;]+)/)?.[1]
    if (token) headers.set('x-csrf-token', decodeURIComponent(token))
  } catch {
    return { input, init: { ...init, headers } }
  }
  return { input, init: { ...init, headers } }
}

const installedKey = '__erpCsrfFetchInstalled'
type CsrfWindow = Window & { [installedKey]?: boolean }

if (typeof window !== 'undefined' && !(window as CsrfWindow)[installedKey]) {
  const target = window as CsrfWindow
  const originalFetch = window.fetch.bind(window)
  target.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const request = requestWithCsrfHeader(input, init, document.cookie, window.location.origin)
    return originalFetch(request.input, request.init)
  }) as typeof window.fetch
  target[installedKey] = true
}
