import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from ..logging_config import get_logger
from ..security import fingerprint

logger = get_logger()


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Registra método, rota, status e duração de toda requisição HTTP.
    Exceções não tratadas são logadas com stack trace antes de propagar,
    para que o /logs/ mostre a causa raiz de qualquer 500."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        request_id = uuid.uuid4().hex
        request.state.request_id = request_id
        client_ip = request.client.host if request.client else ""
        client = fingerprint(client_ip)
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            logger.error(
                f"{request.method} {request.url.path} -> exceção não tratada",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": 500,
                    "duration_ms": duration_ms,
                    "client": client,
                    "request_id": request_id,
                    "actor_id": getattr(request.state, "user_id", None),
                    "outcome": "error",
                },
                exc_info=True,
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        level = logger.warning if response.status_code >= 400 else logger.info
        level(
            f"{request.method} {request.url.path} -> {response.status_code} ({duration_ms}ms)",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "client": client,
                "request_id": request_id,
                "actor_id": getattr(request.state, "user_id", None),
                "outcome": "success" if response.status_code < 400 else "denied",
            },
        )
        response.headers["X-Request-ID"] = request_id
        return response
