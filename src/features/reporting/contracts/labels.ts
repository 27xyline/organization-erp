export const ASSET_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: 'На складе',
  IN_USE: 'В эксплуатации',
  UNDER_REPAIR: 'На ремонте',
  PLANNED_FOR_DISPOSAL: 'К списанию',
  PARTIALLY_DISPOSED: 'Частично списано',
  FULLY_DISPOSED: 'Списано',
}

export const VACATION_TYPE_LABELS: Record<string, string> = {
  VACATION: 'Отпуск',
  SICK_LEAVE: 'Больничный',
  BUSINESS_TRIP: 'Командировка',
  UNPAID_LEAVE: 'Без содержания',
}

export const ACTIVITY_LABELS: Record<string, string> = {
  RECEIPT: 'Поступление имущества',
  TRANSFER: 'Перемещение имущества',
  DISPOSAL: 'Списание имущества',
  STATUS_CHANGE: 'Изменение статуса имущества',
  HIRE: 'Приём сотрудника',
  DISMISS: 'Увольнение сотрудника',
  ARCHIVE: 'Перевод в архив',
  PROMOTE: 'Изменение должности',
  EXTEND: 'Продление договора',
  EDIT: 'Изменение карточки',
}

