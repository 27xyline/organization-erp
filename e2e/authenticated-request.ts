import type { APIRequestContext, Page } from '@playwright/test'

type RequestOptions = Parameters<APIRequestContext['post']>[1]

async function csrfHeaders(page: Page, options?: RequestOptions): Promise<Record<string, string>> {
  const csrfCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'erp_csrf')
  if (!csrfCookie?.value) throw new Error('Authenticated E2E request requires the erp_csrf cookie')

  const headers = new Headers(options?.headers)
  headers.set('origin', new URL(page.url()).origin)
  headers.set('x-csrf-token', csrfCookie.value)
  return Object.fromEntries(headers.entries())
}

async function requestWithCsrf(
  page: Page,
  method: 'post' | 'put' | 'delete',
  url: string,
  options?: RequestOptions,
) {
  return page.request[method](url, {
    ...options,
    headers: await csrfHeaders(page, options),
  })
}

export function authenticatedPost(page: Page, url: string, options?: RequestOptions) {
  return requestWithCsrf(page, 'post', url, options)
}

export function authenticatedPut(page: Page, url: string, options?: RequestOptions) {
  return requestWithCsrf(page, 'put', url, options)
}

export function authenticatedDelete(page: Page, url: string, options?: RequestOptions) {
  return requestWithCsrf(page, 'delete', url, options)
}
