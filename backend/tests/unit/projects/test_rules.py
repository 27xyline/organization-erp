from datetime import datetime

import pytest

from app.domain.errors import DomainError
from app.domain.projects.critical_path import PlanningTask, calculate_critical_path
from app.domain.projects.task_rules import ensure_acyclic_dependencies, ensure_valid_task_hierarchy


def test_critical_path_uses_numeric_weights_and_inclusive_dates():
    tasks = (
        PlanningTask("a", duration=2),
        PlanningTask("b", duration=8, predecessor_ids=("a",)),
        PlanningTask("c", duration=1, predecessor_ids=("a",)),
        PlanningTask(
            "d",
            start_date=datetime(2026, 1, 1),
            end_date=datetime(2026, 1, 3),
            predecessor_ids=("c",),
        ),
        PlanningTask("end", is_milestone=True, predecessor_ids=("b", "d")),
    )
    assert calculate_critical_path(tasks) == ["a", "b"]
    assert (
        calculate_critical_path(
            (PlanningTask("a", predecessor_ids=("b",)), PlanningTask("b", predecessor_ids=("a",)))
        )
        == []
    )
    assert calculate_critical_path(()) == []


def test_hierarchy_and_cycles_are_pure_rules():
    ensure_valid_task_hierarchy("p", 2, "parent", ("p", 1))
    for args in [
        ("p", 2, None, None),
        ("p", 2, "parent", ("other", 1)),
        ("p", 3, "parent", ("p", 3)),
    ]:
        with pytest.raises(DomainError) as error:
            ensure_valid_task_hierarchy(*args)
        assert error.value.code == "INVALID_HIERARCHY"
    with pytest.raises(DomainError) as error:
        ensure_acyclic_dependencies(("a", "b"), (("a", "b"), ("b", "a")))
    assert error.value.code == "INVALID_DEPENDENCY"


def test_duration_numeric_zero_milestone_dates_and_missing_predecessors():
    from datetime import timedelta

    from app.domain.projects.critical_path import duration_days

    start = datetime(2026, 1, 1)
    assert duration_days(PlanningTask("a", duration=0)) == 0
    assert duration_days(PlanningTask("a", duration=8, is_milestone=True)) == 0
    assert (
        duration_days(PlanningTask("a", start_date=start, end_date=start + timedelta(hours=1))) == 2
    )
    assert (
        duration_days(PlanningTask("a", start_date=start, end_date=start - timedelta(days=2))) == 1
    )
    assert duration_days(PlanningTask("a")) == 1
    assert calculate_critical_path(
        (
            PlanningTask("first", duration=3, predecessor_ids=("absent",)),
            PlanningTask("second", duration=3),
        )
    ) == ["first"]
