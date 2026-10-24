from io import BytesIO

from docx import Document
from openpyxl import load_workbook

from app.integrations.exports import render_docx, render_pdf, render_qr, render_xlsx, safe_filename


def test_renderers_keep_russian_labels_and_numeric_values_readable() -> None:
    columns = ["Сотрудник", "Начислено"]
    rows = [["Иван Иванов", 1250.5]]

    xlsx = load_workbook(BytesIO(render_xlsx("Отчёт", columns, rows)), data_only=True)
    assert list(xlsx.active.values) == [("Сотрудник", "Начислено"), ("Иван Иванов", 1250.5)]

    docx = Document(BytesIO(render_docx("Отчёт", columns, rows)))
    assert docx.tables[0].cell(1, 0).text == "Иван Иванов"
    assert docx.tables[0].cell(1, 1).text == "1250.5"

    pdf = render_pdf("Отчёт", columns, rows)
    assert pdf.startswith(b"%PDF-")
    assert b"/FontFile2" in pdf  # embedded TrueType font keeps Cyrillic renderable

    qr = render_qr("https://erp.example/документы")
    assert qr.startswith(b"\x89PNG\r\n\x1a\n")


def test_filename_is_safe_and_keeps_russian_letters() -> None:
    assert safe_filename("Отчёт: октябрь / 2026", "xlsx") == "Отчёт_октябрь_2026.xlsx"
