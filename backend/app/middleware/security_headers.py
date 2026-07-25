from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Cabeçalhos de segurança padrão em toda resposta. A API não serve HTML
    (o frontend é uma SPA separada), então a CSP pode ser restritiva ao
    extremo — nada aqui deveria carregar/executar conteúdo de terceiros."""

    DOCS_PATHS = {"/docs", "/redoc", "/openapi.json"}

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        # /docs e /redoc carregam JS/CSS de CDN (Swagger UI) — CSP restritiva
        # os quebraria. Todo o resto da API só devolve JSON, sem motivo para
        # carregar nada de terceiros.
        if request.url.path not in self.DOCS_PATHS:
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        return response
