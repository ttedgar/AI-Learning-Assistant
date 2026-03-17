import logging
import sys

from pythonjsonlogger import jsonlogger

from app.config import get_settings


def configure_logging() -> None:
    """
    Configure structured JSON logging for the application.

    Outputs JSON to stdout so log aggregators (Datadog, ELK, GCP Logging) can
    ingest and query log fields without fragile regex parsing.

    Production note: In a full observability stack this would also configure
    OpenTelemetry trace/span IDs injected into each log record, enabling
    log-trace correlation in Jaeger or similar. Here we log a plain
    correlation_id field that the caller injects via the extra= kwarg.
    """
    settings = get_settings()
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    formatter = jsonlogger.JsonFormatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    # Remove any existing handlers to avoid duplicate output
    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    # Quieten noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
