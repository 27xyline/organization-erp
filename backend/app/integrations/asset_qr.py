"""Создаёт закрытые QR-метки в SVG для существующего URL сканера инвентаризации."""

import io
from xml.etree import ElementTree

import qrcode  # type: ignore[import-untyped]
from qrcode.image.svg import SvgPathImage  # type: ignore[import-untyped]


def render_asset_qr(url: str) -> bytes:
    code = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_Q, border=2)
    code.add_data(url)
    code.make(fit=True)
    output = io.BytesIO()
    code.make_image(image_factory=SvgPathImage).save(output)
    root = ElementTree.fromstring(output.getvalue())
    # Сериализовать пространство имён по умолчанию для документа, не изменяя
    # глобальный для процесса реестр префиксов ElementTree (lxml доступен при
    # установленной поддержке DOCX).
    namespace = "{http://www.w3.org/2000/svg}"
    for element in root.iter():
        if isinstance(element.tag, str) and element.tag.startswith(namespace):
            element.tag = element.tag.removeprefix(namespace)
    root.set("xmlns", "http://www.w3.org/2000/svg")
    root.set("width", "256")
    root.set("height", "256")
    return bytes(ElementTree.tostring(root, encoding="utf-8"))
