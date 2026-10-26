from __future__ import annotations

import json
import logging
import logging.config
from datetime import UTC, datetime
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        if record.exc_info and record.exc_info[0] is not None:
            message = "exception"
        else:
            message = record.getMessage()
        entry: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": message,
        }
        if record.exc_info:
            exception = record.exc_info[1]
            entry["exception_type"] = type(exception).__name__ if exception else "unknown"
        return json.dumps(entry, ensure_ascii=False, separators=(",", ":"))


def configure_logging() -> None:
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {"json": {"()": "app.core.logging.JsonFormatter"}},
            "handlers": {"default": {"class": "logging.StreamHandler", "formatter": "json"}},
            "root": {"handlers": ["default"], "level": "INFO"},
        }
    )
