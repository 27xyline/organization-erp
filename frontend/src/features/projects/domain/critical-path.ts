interface PlanningTask {
  id: string
  duration?: number | null
  startDate?: Date | string | null
  endDate?: Date | string | null
  isMilestone?: boolean
  predecessors?: Array<{ predecessorId: string }>
}

function durationDays(task: PlanningTask) {
  if (task.isMilestone) return 0
  if (task.duration !== null && task.duration !== undefined) return Math.max(0, task.duration)
  if (task.startDate && task.endDate) {
    const start = new Date(task.startDate).getTime()
    const end = new Date(task.endDate).getTime()
    return Math.max(1, Math.ceil((end - start) / 86_400_000) + 1)
  }
  return 1
}

export function calculateCriticalPath(tasks: readonly PlanningTask[]): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const indegree = new Map(tasks.map((task) => [task.id, 0]))
  const successors = new Map(tasks.map((task) => [task.id, [] as string[]]))
  tasks.forEach((task) => {
    ;(task.predecessors || []).forEach(({ predecessorId }) => {
      if (!byId.has(predecessorId)) return
      successors.get(predecessorId)?.push(task.id)
      indegree.set(task.id, (indegree.get(task.id) || 0) + 1)
    })
  })

  const queue = tasks.filter((task) => indegree.get(task.id) === 0).map((task) => task.id)
  const distance = new Map(tasks.map((task) => [task.id, durationDays(task)]))
  const previous = new Map<string, string>()
  let processed = 0

  while (queue.length) {
    const current = queue.shift()!
    processed += 1
    for (const next of successors.get(current) || []) {
      const candidate = (distance.get(current) || 0) + durationDays(byId.get(next)!)
      if (candidate > (distance.get(next) || 0)) {
        distance.set(next, candidate)
        previous.set(next, current)
      }
      indegree.set(next, (indegree.get(next) || 1) - 1)
      if (indegree.get(next) === 0) queue.push(next)
    }
  }
  if (processed !== tasks.length || tasks.length === 0) return []

  let current = tasks.reduce((best, task) =>
    (distance.get(task.id) || 0) > (distance.get(best.id) || 0) ? task : best
  ).id
  const path = [current]
  while (previous.has(current)) {
    current = previous.get(current)!
    path.unshift(current)
  }
  return path
}
