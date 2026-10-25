"Чистые инварианты графа задач и иерархии из прежней реализации."

from collections.abc import Sequence

from app.domain.errors import DomainError


def invalid(code: str, message: str) -> None:
    raise DomainError(code, message, 422)


def ensure_valid_task_hierarchy(
    project_id: str, level: int, parent_id: str | None, parent: tuple[str, int] | None
) -> None:
    if not parent_id:
        if level != 1:
            invalid("INVALID_HIERARCHY", "Корневая задача должна иметь уровень 1")
        return
    if parent is None:
        invalid("INVALID_HIERARCHY", "Родительская задача не найдена")
        return
    if parent[0] != project_id:
        invalid("INVALID_HIERARCHY", "Родительская задача должна принадлежать этому проекту")
    if parent[1] >= 3:
        invalid("INVALID_HIERARCHY", "Нельзя создать подзадачу глубже третьего уровня")
    if level != parent[1] + 1:
        invalid(
            "INVALID_HIERARCHY",
            "Уровень подзадачи должен быть на один больше уровня родительской задачи",
        )


def ensure_acyclic_dependencies(task_ids: Sequence[str], edges: Sequence[tuple[str, str]]) -> None:
    adjacency: dict[str, list[str]] = {key: [] for key in task_ids}
    for predecessor, successor in edges:
        if predecessor in adjacency:
            adjacency[predecessor].append(successor)
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(key: str) -> None:
        if key in visiting:
            invalid("INVALID_DEPENDENCY", "Зависимости задач образуют цикл")
        if key in visited:
            return
        visiting.add(key)
        for successor in adjacency.get(key, []):
            visit(successor)
        visiting.remove(key)
        visited.add(key)

    for key in task_ids:
        visit(key)
