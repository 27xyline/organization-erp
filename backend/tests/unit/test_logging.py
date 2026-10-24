from __future__ import annotations

import json
import logging
import sys

from app.core.logging import JsonFormatter


def test_json_formatter_drops_exception_message_and_stack() -> None:
    try:
        raise RuntimeError("private employee email is alice@example.test")
    except RuntimeError:
        record = logging.LogRecord(
            "app.worker",
            logging.ERROR,
            __file__,
            1,
            "Delivery failed: %s",
            ("private employee email is alice@example.test",),
            sys.exc_info(),
        )

    rendered = JsonFormatter().format(record)
    entry = json.loads(rendered)

    assert entry["message"] == "exception"
    assert entry["exception_type"] == "RuntimeError"
    assert "alice@example.test" not in rendered
    assert "Traceback" not in rendered
