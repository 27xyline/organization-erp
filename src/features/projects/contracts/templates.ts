export const PROJECT_TEMPLATES = {
  RESEARCH: {
    label: 'Исследовательский проект',
    description: 'Гипотеза, эксперимент, анализ и итоговый отчёт.',
    defaults: {
      description: 'Исследовательский проект с поэтапной проверкой гипотезы.',
      goals: 'Получить воспроизводимый результат и подтвердить исходную гипотезу.',
      tasks: 'Подготовка; эксперимент; анализ данных; итоговый отчёт.',
      results: 'Отчёт, набор данных и рекомендации по дальнейшей работе.',
    },
    tasks: [
      { name: 'Подготовка программы исследования', offset: 0, duration: 10, priority: 'HIGH', risk: 'MEDIUM', predecessors: [] },
      { name: 'Проведение эксперимента', offset: 10, duration: 20, priority: 'HIGH', risk: 'HIGH', predecessors: [0] },
      { name: 'Анализ результатов', offset: 30, duration: 10, priority: 'MEDIUM', risk: 'MEDIUM', predecessors: [1] },
      { name: 'Утверждение итогового отчёта', offset: 40, duration: 0, priority: 'CRITICAL', risk: 'LOW', predecessors: [2], isMilestone: true },
    ],
  },
  PROCUREMENT: {
    label: 'Закупка и ввод в эксплуатацию',
    description: 'Потребность, конкурс, поставка, приёмка и запуск.',
    defaults: {
      description: 'Закупка оборудования с последующим вводом в эксплуатацию.',
      goals: 'Поставить оборудование в согласованные сроки и бюджет.',
      tasks: 'Техническое задание; выбор поставщика; поставка; приёмка; запуск.',
      results: 'Принятое на учёт и введённое в эксплуатацию оборудование.',
    },
    tasks: [
      { name: 'Подготовка технического задания', offset: 0, duration: 7, priority: 'HIGH', risk: 'MEDIUM', predecessors: [] },
      { name: 'Выбор поставщика', offset: 7, duration: 14, priority: 'HIGH', risk: 'HIGH', predecessors: [0] },
      { name: 'Поставка и входной контроль', offset: 21, duration: 21, priority: 'MEDIUM', risk: 'HIGH', predecessors: [1] },
      { name: 'Ввод в эксплуатацию', offset: 42, duration: 0, priority: 'CRITICAL', risk: 'LOW', predecessors: [2], isMilestone: true },
    ],
  },
} as const

export type ProjectTemplateId = keyof typeof PROJECT_TEMPLATES
