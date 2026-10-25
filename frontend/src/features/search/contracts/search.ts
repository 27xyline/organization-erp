import { z } from 'zod'
import type { Permission } from '@/lib/auth/permissions'

export const GLOBAL_SEARCH_PERMISSIONS = [
  'employees.read',
  'assets.read',
  'projects.read',
  'tasks.read',
  'documents.read',
] as const satisfies readonly Permission[]

export const globalSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Введите не менее двух символов').max(100, 'Запрос слишком длинный'),
})

export type GlobalSearchType = 'employee' | 'asset' | 'project' | 'task' | 'document'

export interface GlobalSearchItem {
  id: string
  type: GlobalSearchType
  title: string
  subtitle: string
  href: string
}
