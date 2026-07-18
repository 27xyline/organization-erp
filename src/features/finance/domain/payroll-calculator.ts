export const PERSONAL_INCOME_TAX_RATE = 0.13
export const EMPLOYER_CONTRIBUTION_RATE = 0.3

export function calculatePayroll(input: {
  plannedBase: number
  plannedAllowance: number
  actualBase: number
  allowance: number
  bonus: number
  oneTime: number
  deduction: number
}) {
  const plannedGross = input.plannedBase + input.plannedAllowance
  const gross = Math.max(
    0,
    input.actualBase + input.allowance + input.bonus + input.oneTime - input.deduction,
  )
  const tax = Math.round(gross * PERSONAL_INCOME_TAX_RATE * 100) / 100
  const contributions = Math.round(gross * EMPLOYER_CONTRIBUTION_RATE * 100) / 100
  return {
    plannedGross: Math.round(plannedGross * 100) / 100,
    gross: Math.round(gross * 100) / 100,
    tax,
    contributions,
    payable: Math.round((gross - tax) * 100) / 100,
    employerCost: Math.round((gross + contributions) * 100) / 100,
    variance: Math.round((gross - plannedGross) * 100) / 100,
  }
}
