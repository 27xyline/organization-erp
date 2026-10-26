"Самый длинный путь в DAG с весами длительности и стабильным разрешением равенств."

from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from math import ceil


@dataclass(frozen=True, slots=True)
class PlanningTask:
    id: str
    duration: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_milestone: bool = False
    predecessor_ids: tuple[str, ...] = ()


def duration_days(task: PlanningTask) -> int:
    if task.is_milestone:
        return 0
    if task.duration is not None:
        return max(0, task.duration)
    if task.start_date and task.end_date:
        return max(1, ceil((task.end_date - task.start_date).total_seconds() / 86400) + 1)
    return 1


def calculate_critical_path(tasks: Sequence[PlanningTask]) -> list[str]:
    if not tasks:
        return []
    by_id = {task.id: task for task in tasks}
    indegree = dict.fromkeys(by_id, 0)
    successors: dict[str, list[str]] = {key: [] for key in by_id}
    for task in tasks:
        for predecessor in task.predecessor_ids:
            if predecessor in by_id:
                successors[predecessor].append(task.id)
                indegree[task.id] += 1
    queue = deque(key for key, count in indegree.items() if count == 0)
    distance = {task.id: duration_days(task) for task in tasks}
    previous: dict[str, str] = {}
    processed = 0
    while queue:
        current = queue.popleft()
        processed += 1
        for successor in successors[current]:
            candidate = distance[current] + duration_days(by_id[successor])
            if candidate > distance[successor]:
                distance[successor] = candidate
                previous[successor] = current
            indegree[successor] -= 1
            if indegree[successor] == 0:
                queue.append(successor)
    if processed != len(tasks):
        return []
    current = max(by_id, key=lambda key: distance[key])
    path = [current]
    while current in previous:
        current = previous[current]
        path.insert(0, current)
    return path
