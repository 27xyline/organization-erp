import { NextResponse } from 'next/server'
import type { ZodError } from 'zod'

export function apiData<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init)
}

export function apiList<T>(
  data: T[],
  pagination: { page: number; pageSize: number; total: number },
) {
  return NextResponse.json({
    data,
    pagination: {
      ...pagination,
      totalPages: Math.max(1, Math.ceil(pagination.total / pagination.pageSize)),
    },
  })
}

export function apiError(
  code: string,
  message: string,
  status: number,
  fieldErrors?: Record<string, string[] | undefined>,
) {
  return NextResponse.json(
    { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } },
    { status },
  )
}

export function apiValidationError(error: ZodError) {
  return apiError('VALIDATION_ERROR', 'Проверьте введённые данные', 422, error.flatten().fieldErrors)
}
