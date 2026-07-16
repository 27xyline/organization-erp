import {
  type Asset,
  type Employee,
  type PersonnelAction,
  type Project,
  type Vacation,
  type StaffSchedule,
  type AssetGroup,
  type Mol,
} from '@/types'
import {
  type CreateEmployeeInput,
  type UpdateEmployeeInput
} from '@/features/employees/contracts/employee'

/**
 * Standard paginated response interface
 */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

class ApiError extends Error {
  public status: number
  public data: any

  constructor(status: number, message: string, data?: any) {
    super(message)
    this.status = status
    this.data = data
  }
}

/**
 * Core fetch wrapper that automatically handles JSON, HTTP Errors, and standardizes responses.
 */
async function fetchBase<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  // Try parsing JSON response
  let data
  try {
    data = await res.json()
  } catch (_e) {
    data = null
  }

  if (!res.ok) {
    const message = data?.message || res.statusText || 'Произошла ошибка при запросе'
    throw new ApiError(res.status, message, data?.errors)
  }

  return data as T
}

/**
 * Helper to construct query params
 */
function buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return ''
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value))
    }
  })
  const qs = searchParams.toString()
  return qs ? `?${qs}` : ''
}

export const api = {
  assets: {
    list: (params?: { page?: number; limit?: number; search?: string; status?: string; groupId?: string; molId?: string }) =>
      fetchBase<PaginatedResponse<Asset>>(`/api/assets${buildQuery(params)}`),
    get: (id: string) => fetchBase<Asset>(`/api/assets/${id}`),
    create: (data: any) => fetchBase<Asset>('/api/assets', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchBase<Asset>(`/api/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    archive: (id: string) => fetchBase<{ success: boolean }>(`/api/assets/${id}/archive`, { method: 'POST' }),
  },
  employees: {
    list: (params?: { page?: number; limit?: number; scope?: 'active' | 'archived' | 'all' }) =>
      fetchBase<PaginatedResponse<Employee>>(`/api/employees${buildQuery(params)}`),
    get: (id: string) => fetchBase<Employee>(`/api/employees/${id}`),
    create: (data: CreateEmployeeInput) => fetchBase<Employee>('/api/employees', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: UpdateEmployeeInput) => fetchBase<Employee>(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  personnelActions: {
    list: (params?: { page?: number; limit?: number }) =>
      fetchBase<PaginatedResponse<PersonnelAction>>(`/api/personnel-actions${buildQuery(params)}`),
    create: (data: any) => fetchBase<PersonnelAction>('/api/personnel-actions', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => fetchBase<{ success: boolean }>(`/api/personnel-actions/${id}`, { method: 'DELETE' }),
  },
  projects: {
    list: (params?: { page?: number; limit?: number; status?: string }) =>
      fetchBase<Project[]>(`/api/projects${buildQuery(params)}`),
    get: (id: string) => fetchBase<Project>(`/api/projects/${id}`),
    create: (data: any) => fetchBase<Project>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchBase<Project>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchBase<{ success: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  },
  vacations: {
    list: (params?: { year?: number }) => fetchBase<Vacation[]>(`/api/vacations${buildQuery(params)}`),
    create: (data: any) => fetchBase<Vacation>('/api/vacations', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchBase<Vacation>(`/api/vacations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  staffSchedule: {
    list: () => fetchBase<StaffSchedule[]>('/api/staff-schedule'),
    create: (data: any) => fetchBase<StaffSchedule>('/api/staff-schedule', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchBase<StaffSchedule>(`/api/staff-schedule/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchBase<{ success: boolean }>(`/api/staff-schedule/${id}`, { method: 'DELETE' }),
  },
  groups: {
    list: () => fetchBase<AssetGroup[]>('/api/groups'),
    create: (data: any) => fetchBase<AssetGroup>('/api/groups', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchBase<AssetGroup>(`/api/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  mols: {
    list: () => fetchBase<Mol[]>('/api/mols'),
    create: (data: any) => fetchBase<Mol>('/api/mols', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => fetchBase<Mol>(`/api/mols/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
}
