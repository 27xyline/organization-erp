export function standardMonthlyHours(year: number, month: number) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  let weekdays = 0
  for (let day = 1; day <= days; day += 1) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    if (weekday !== 0 && weekday !== 6) weekdays += 1
  }
  return weekdays * 8
}

export function calculateLaborAmounts(input: {
  baseSalary: number
  normativeHours: number
  paidHours: number
  overtimeHours: number
  projectHours: number
  projectOvertimeHours: number
}) {
  if (input.normativeHours <= 0) {
    return { calculatedSalary: 0, projectCost: 0 }
  }
  const hourlyRate = input.baseSalary / input.normativeHours
  return {
    calculatedSalary: Math.round((
      Math.min(input.paidHours / input.normativeHours, 1) * input.baseSalary +
      input.overtimeHours * hourlyRate * 1.5
    ) * 100) / 100,
    projectCost: Math.round((
      input.projectHours * hourlyRate +
      input.projectOvertimeHours * hourlyRate * 1.5
    ) * 100) / 100,
  }
}
