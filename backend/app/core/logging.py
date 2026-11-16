import logging


class _SkipHealthChecks(logging.Filter):
    """Drop uvicorn access-log lines for /health* (Docker pings them every few seconds)."""

    def filter(self, record: logging.LogRecord) -> bool:
        # uvicorn.access args: (client_addr, method, path, http_version, status_code)
        args = record.args
        return not (isinstance(args, tuple) and len(args) >= 3 and "/health" in str(args[2]))


def configure_logging() -> None:
    access_logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, _SkipHealthChecks) for f in access_logger.filters):
        access_logger.addFilter(_SkipHealthChecks())
