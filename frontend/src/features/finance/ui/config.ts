import { FinanceSectionType, FinanceMonthCell } from '@/features/finance/contracts/ui-types'

export const monthLabels = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

export const stickyColumnStyles = {
  fullName: { left: 0, width: 240 },
  department: { left: 240, width: 180 },
  position: { left: 420, width: 180 },
  rate: { left: 600, width: 120 },
  salary: { left: 720, width: 140 },
} as const

export const pageConfig: Record<FinanceSectionType, {
  title: string
  endpoint: (year: number) => string
  editable: boolean
  saveType?: 'oklad' | 'nadbavka'
  iconClassName: string
  badgeClassName: string
  modeLabel: string
}> = {
  salary: {
    title: 'Заработная плата',
    endpoint: (year) => `/api/finance/salary?year=${year}`,
    editable: false,
    iconClassName: 'bg-slate-100 text-slate-700',
    badgeClassName: 'border-slate-200 bg-slate-100 text-slate-700',
    modeLabel: 'Автоматический расчет',
  },
  oklad: {
    title: 'Оклад',
    endpoint: (year) => `/api/finance/plans?type=oklad&year=${year}`,
    editable: true,
    saveType: 'oklad',
    iconClassName: 'bg-blue-100 text-blue-700',
    badgeClassName: 'border-blue-200 bg-blue-100 text-blue-700',
    modeLabel: 'Через проект',
  },
  nadbavka: {
    title: 'Надбавка',
    endpoint: (year) => `/api/finance/plans?type=nadbavka&year=${year}`,
    editable: true,
    saveType: 'nadbavka',
    iconClassName: 'bg-violet-100 text-violet-700',
    badgeClassName: 'border-violet-200 bg-violet-100 text-violet-700',
    modeLabel: 'Через проект',
  },
}

export const emptyCell = (): FinanceMonthCell => ({
  amount: '0.00',
  projectId: null,
  projectCode: '',
  projectName: '',
  projectLabel: '',
  allocations: [],
})

export const createEmptyAllocation = () => ({
  localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  projectId: '',
  amount: '',
})

export const formatAmountValue = (value: string) => {
  const normalized = value.replace(',', '.').trim()

  if (!normalized) return '0.00'

  const numericValue = Number(normalized)

  if (Number.isNaN(numericValue)) return '0.00'

  return numericValue.toFixed(2)
}
