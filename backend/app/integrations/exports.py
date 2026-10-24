"""Synchronous export renderers; callers run these after the DB UoW in a worker thread."""

from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Any

import qrcode  # type: ignore[import-untyped]
import reportlab
from docx import Document as WordDocument
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils.cell import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle

_FONT_REGISTRATION_LOCK = Lock()


def safe_filename(value: str, extension: str) -> str:
    stem = re.sub(r"[^\w.-]+", "_", value, flags=re.UNICODE).strip("._") or "report"
    return f"{stem[:100]}.{extension.lstrip('.')}"


def render_xlsx(title: str, columns: list[str], rows: list[list[Any]]) -> bytes:
    workbook = Workbook()
    workbook.properties.creator = "Consilium"
    sheet = workbook.active
    assert sheet is not None
    sheet.title = title[:31] or "Отчёт"
    sheet.append(columns)
    for row in rows:
        sheet.append(row)
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for cell in sheet[1]:
        cell.font = Font(name="Arial", bold=True, color="FF0F172A")
        cell.fill = PatternFill(fill_type="solid", fgColor="FFE2E8F0")
    for column in range(1, sheet.max_column + 1):
        width = max(
            len(str(sheet.cell(row, column).value or "")) for row in range(1, sheet.max_row + 1)
        )
        sheet.column_dimensions[get_column_letter(column)].width = min(40, max(14, width + 2))
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def render_docx(title: str, columns: list[str], rows: list[list[Any]]) -> bytes:
    document = WordDocument()
    document.add_heading(title, level=1)
    table = document.add_table(rows=1, cols=len(columns))
    table.style = "Table Grid"
    for cell, value in zip(table.rows[0].cells, columns, strict=True):
        cell.text = str(value)
    for row in rows:
        cells = table.add_row().cells
        for cell, value in zip(cells, row, strict=True):
            cell.text = "" if value is None else str(value)
    output = BytesIO()
    document.save(output)
    return output.getvalue()


def _cyrillic_font(text: str) -> Path:
    assert reportlab.__file__ is not None
    candidates = (
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
        Path(reportlab.__file__).parent / "fonts" / "Vera.ttf",
    )
    for candidate in candidates:
        if not candidate.is_file():
            continue
        font = TTFont("Stage12FontProbe", str(candidate))
        if all(ord(character) in font.face.charToGlyph for character in text):
            return candidate
    raise RuntimeError("No installed TrueType font supports every character in this PDF")


def render_pdf(title: str, columns: list[str], rows: list[list[Any]]) -> bytes:
    font_text = title + "".join(str(value) for value in columns)
    font_text += "".join(str(value) for row in rows for value in row if value is not None)
    font_path = _cyrillic_font(font_text)
    with _FONT_REGISTRATION_LOCK:
        if "ConsiliumStage12" not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont("ConsiliumStage12", str(font_path)))
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=landscape(letter), title=title)
    data = [columns] + [["" if value is None else str(value) for value in row] for row in rows]
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), "ConsiliumStage12"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#94a3b8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Stage12Title", parent=styles["Title"], fontName="ConsiliumStage12"
    )
    document.build([Paragraph(title, title_style), table])
    return output.getvalue()


def render_qr(value: str) -> bytes:
    code = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, border=2)
    code.add_data(value)
    code.make(fit=True)
    output = BytesIO()
    code.make_image().save(output, format="PNG")
    return output.getvalue()
