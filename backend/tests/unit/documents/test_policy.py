import pytest

from app.domain.documents.file_policy import validate_file
from app.domain.documents.versioning import can_transition
from app.domain.errors import DomainError


def test_file_normalization_and_mime_policy():
    assert (
        validate_file("../../Приказ.txt", "text/plain; charset=utf-8", 5, 20).filename
        == "Приказ.txt"
    )
    with pytest.raises(DomainError, match="Тип файла"):
        validate_file("a.pdf", "text/plain", 5, 20)
    with pytest.raises(DomainError) as error:
        validate_file("a.txt", "text/plain", 21, 20)
    assert error.value.code == "FILE_TOO_LARGE"


def test_status_matrix():
    transitions = {
        "DRAFT": ["IN_REVIEW"],
        "IN_REVIEW": ["DRAFT", "APPROVED"],
        "APPROVED": ["IN_REVIEW", "SIGNED"],
        "SIGNED": [],
        "ARCHIVED": [],
    }
    for source in transitions:
        for target in transitions:
            assert can_transition(source, target) == (target in transitions[source])
