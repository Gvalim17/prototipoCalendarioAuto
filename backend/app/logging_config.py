import json
import logging
import os
import copy
from logging.handlers import RotatingFileHandler
from pathlib import Path

from .security import redact_sensitive_text


LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_FILE = LOG_DIR / "app.jsonl"

APP_LOGGER_NAME = "calendario"


class JsonLineFormatter(logging.Formatter):
    """Formata cada registro como uma linha JSON (JSONL), para leitura
    programática pelo endpoint /logs/ sem depender de parsing de texto livre."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_sensitive_text(record.getMessage()),
        }
        # Campos estruturados extras passados via logger.info(..., extra={...})
        for key in (
            "method", "path", "status_code", "duration_ms", "client", "event",
            "request_id", "actor_id", "outcome", "resource",
        ):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = redact_sensitive_text(self.formatException(record.exc_info))
        return json.dumps(payload, ensure_ascii=False)


class RedactingConsoleFormatter(logging.Formatter):
    """Applies the same secret filtering to local/server console output."""

    def format(self, record: logging.LogRecord) -> str:
        safe_record = copy.copy(record)
        safe_record.msg = redact_sensitive_text(record.getMessage())
        safe_record.args = ()
        if record.exc_info:
            safe_record.exc_text = redact_sensitive_text(self.formatException(record.exc_info))
        return super().format(safe_record)


def setup_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    try:
        LOG_DIR.chmod(0o700)
    except OSError:
        pass

    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    logger = logging.getLogger(APP_LOGGER_NAME)
    if logger.handlers:
        # Evita handlers duplicados se init_db/setup for chamado mais de uma vez
        # (ex.: recarregamento do uvicorn em modo --reload).
        return

    logger.setLevel(level)
    logger.propagate = False

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(RedactingConsoleFormatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s", "%Y-%m-%d %H:%M:%S"
    ))
    logger.addHandler(console_handler)

    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(JsonLineFormatter())
    logger.addHandler(file_handler)
    try:
        LOG_FILE.chmod(0o600)
    except OSError:
        pass


def get_logger() -> logging.Logger:
    return logging.getLogger(APP_LOGGER_NAME)
