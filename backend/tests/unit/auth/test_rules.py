from app.domain.auth.rules import AccessContext, ScopeGrant, expand_descendants


def test_descendants_cycle_and_multi_grant_cannot_mix_finance_scopes():
    assert set(expand_descendants(("a",), (("a", "b"), ("b", "a"), ("c", "b")))) == {"a", "b", "c"}
    access = AccessContext(
        "u",
        None,
        None,
        (),
        (
            ScopeGrant("1", "ACCOUNTANT", "ASSIGNED", "ASSIGNED", ("d1",), ("p1",)),
            ScopeGrant("2", "ACCOUNTANT", "ASSIGNED", "ASSIGNED", ("d2",), ("p2",)),
        ),
    )
    assert access.allows("finance.salary.read", {"departmentId": "d1", "projectId": "p1"})
    assert not access.allows("finance.salary.read", {"departmentId": "d1", "projectId": "p2"})
    assert not access.allows("finance.salary.read", {})


def test_employee_self_membership_export_and_none_are_guarded():
    access = AccessContext("u", "e", "d", ("p",), (ScopeGrant("1", "EMPLOYEE", "SELF", "SELF"),))
    assert access.allows("employees.read", {"employeeId": "e"})
    assert not access.allows("employees.read", {"employeeId": "other", "departmentId": "d"})
    assert access.allows("projects.read", {"projectId": "p"})
    assert not access.allows("projects.read", {"projectId": "other"})
    assert not access.has("assets.export")
    assert not AccessContext("u", None, None, (), (ScopeGrant("1", "HR", "NONE", "NONE"),)).allows(
        "employees.read", {"departmentId": "d"}
    )


def test_list_reference_export_and_documents_use_complete_grant_scope():
    import pytest

    from app.domain.auth.rules import require_permission
    from app.domain.errors import DomainError

    access = AccessContext(
        "u",
        None,
        None,
        (),
        (
            ScopeGrant(
                "1", "DEPARTMENT_HEAD", "ASSIGNED", "ASSIGNED", ("root", "child"), ("project",)
            ),
            ScopeGrant("2", "HR", "ASSIGNED", "NONE", ("other",), ()),
        ),
    )
    assert set(access.allowed_department_ids("employees.read")) == {"root", "child", "other"}
    assert access.allowed_project_ids("projects.read") == ("project",)
    assert access.allows("employees.read", {"departmentId": "child"})
    assert not access.allows("employees.read", {"departmentId": "foreign"})
    assert access.allows("assets.export", {"departmentIds": ["child", "foreign"]})
    with pytest.raises(DomainError):
        require_permission(
            access, "assets.export", {"projectId": "foreign", "departmentIds": ["foreign"]}
        )
    assert access.allows(
        "documents.read",
        {
            "documentProjectId": "project",
            "documentEmployeeDepartmentId": "child",
            "documentEmployeeId": "e",
        },
    )
    assert not access.allows(
        "documents.read",
        {
            "documentProjectId": "project",
            "documentEmployeeDepartmentId": "other",
            "documentEmployeeId": "e",
        },
    )
    assert not access.allows("documents.read", {})
    admin = AccessContext("a", None, None, (), (ScopeGrant("3", "ADMIN", "ALL", "ALL"),))
    assert admin.allowed_department_ids("employees.read") is None
    assert admin.allows("documents.read", {})
