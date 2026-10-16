"""Generate private SVG QR labels for the existing inventory scanner URL."""

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
    root.set("width", "256")
    root.set("height", "256")
    return bytes(ElementTree.tostring(root, encoding="utf-8"))
