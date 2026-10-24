import pytest
from pydantic import ValidationError

from app.schemas.reporting import ReportPresetInput


def test_report_preset_contract_normalizes_name_and_preserves_optional_filters() -> None:
    preset = ReportPresetInput.model_validate(
        {
            "name": "  ФОТ отдела  ",
            "metrics": ["plannedFot"],
            "groupBy": "department",
            "filters": {"year": 2026},
        }
    )

    assert preset.model_dump() == {
        "name": "ФОТ отдела",
        "metrics": ["plannedFot"],
        "groupBy": "department",
        "filters": {"year": 2026},
    }


@pytest.mark.parametrize(
    "body",
    [
        {"name": "   ", "metrics": ["headcount"]},
        {"name": "Пустой отчёт", "metrics": []},
        {"name": "Плохая метрика", "metrics": ["password"]},
    ],
)
def test_report_preset_contract_rejects_invalid_names_metrics_and_empty_metric_lists(
    body: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        ReportPresetInput.model_validate(body)
