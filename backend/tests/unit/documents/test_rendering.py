from datetime import datetime
from io import BytesIO

import pytest
from docx import Document

from app.integrations.document_rendering import DocumentRenderer
from app.services.dto.documents import GenerateCommand

pytestmark = pytest.mark.anyio


@pytest.mark.parametrize(
    "template,heading,signature",
    [
        ("PERSONNEL_ORDER", "ПРИКАЗ", "С приказом ознакомлен(а)"),
        ("ACCEPTANCE_ACT", "АКТ", "Принял"),
    ],
)
@pytest.mark.parametrize("format", ["docx", "pdf"])
async def test_russian_templates_are_real_parseable_documents(template, heading, signature, format):
    command = GenerateCommand(
        template,
        "Приказ сотрудника",
        "08",
        datetime(2026, 10, 23),
        "О передаче имущества",
        "Передать ноутбук сотруднику Иванову.\nСтрока два.",
        "Заявление сотрудника",
        format=format,
    )
    content = await DocumentRenderer().render(command.render_template())
    if format == "docx":
        parsed = Document(BytesIO(content))
        text = "\n".join(p.text for p in parsed.paragraphs)
        assert heading in text and signature in text and "Передать ноутбук" in text
        assert "23 октября 2026 г." in text
        assert parsed.styles["Normal"].font.name == "Arial"
    else:
        assert content.startswith(b"%PDF-") and content.rstrip().endswith(b"%%EOF")
        assert b"/FontFile2" in content
        assert b"/ToUnicode" in content
