from app.domain.auth.rules import AccessContext, ScopeGrant
from app.domain.ports.projects import TaskRecord
from app.domain.projects.task_visibility import visible_project_tasks


def test_employee_task_list_does_not_disclose_other_tasks_or_dependencies():
    access = AccessContext("u", "e", None, ("p",), (ScopeGrant("1", "EMPLOYEE", "SELF", "SELF"),))
    tasks = (
        TaskRecord.from_values(
            {
                "id": "a",
                "name": "A",
                "projectId": "p",
                "level": 1,
                "assignees": [{"employeeId": "e"}],
                "predecessors": [
                    {"predecessorId": "b", "predecessor": {"id": "b", "name": "Secret"}}
                ],
            }
        ),
        TaskRecord.from_values(
            {
                "id": "b",
                "name": "Secret",
                "projectId": "p",
                "level": 1,
                "assignees": [{"employeeId": "other"}],
            }
        ),
    )
    result = visible_project_tasks(tasks, access, "p")
    assert [task.id for task in result] == ["a"]
    assert result[0].predecessors == ()
