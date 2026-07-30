import os

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from .database import init_db
from .logging_config import get_logger, setup_logging
from .middleware.request_logging import RequestLoggingMiddleware
from .middleware.security_headers import SecurityHeadersMiddleware
from .dependencies import get_current_user, require_csrf
from .routers import academic, alerts, auth, holidays, lesson_plans, logs, recesses, schedules, users


setup_logging()
logger = get_logger()

init_db()
logger.info("Aplicação inicializada", extra={"event": "startup"})

app = FastAPI(title="CronEdu · Sistema de Cronogramas")

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://calendarioauto.vercel.app",
]
env_origins = os.getenv("ALLOWED_ORIGINS")
if env_origins:
    for origin in env_origins.split(","):
        clean = origin.strip()
        if clean and clean not in ALLOWED_ORIGINS:
            ALLOWED_ORIGINS.append(clean)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token", "X-Admin-Action-Token"],
)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    request_id = getattr(request.state, "request_id", None)
    logger.error(
        "Violação de integridade no banco de dados",
        extra={"event": "integrity_error", "path": request.url.path, "method": request.method, "request_id": request_id},
        exc_info=exc,
    )
    pgcode = getattr(getattr(exc, "orig", None), "pgcode", None)
    if pgcode == "23503":  # foreign_key_violation
        detail = "Não é possível concluir esta ação porque existem outros registros vinculados a este item. Remova-os primeiro."
    elif pgcode == "23505":  # unique_violation
        detail = "Já existe um registro com esses dados."
    elif pgcode == "23502":  # not_null_violation
        detail = "Campo obrigatório ausente para concluir esta operação."
    else:
        detail = "Não foi possível concluir a operação devido a uma restrição do banco de dados."
    return JSONResponse(status_code=409, content={"detail": detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)
    logger.error(
        "Erro não tratado",
        extra={"event": "unhandled_exception", "path": request.url.path, "method": request.method, "request_id": request_id},
        exc_info=exc,
    )
    return JSONResponse(status_code=500, content={"detail": "Erro interno do servidor. Tente novamente em instantes."})


@app.get("/")
def read_root():
    return {"status": "online", "message": "API do CronEdu"}


app.include_router(auth.router)
app.include_router(alerts.system_router)
# Sem sessão: valida pelo token opaco do link de compartilhamento (alunos sem login).
app.include_router(lesson_plans.public_lesson_materials_router)
# Sem sessão: valida por token próprio na URL (Google Agenda/Outlook buscam sozinhos).
app.include_router(alerts.public_calendar_router)
protected_dependencies = [Depends(get_current_user), Depends(require_csrf)]
app.include_router(academic.router, dependencies=protected_dependencies)
app.include_router(holidays.router, dependencies=protected_dependencies)
app.include_router(recesses.router, dependencies=protected_dependencies)
app.include_router(schedules.router, dependencies=protected_dependencies)
app.include_router(logs.router, dependencies=protected_dependencies)
app.include_router(alerts.router, dependencies=protected_dependencies)
app.include_router(users.router, dependencies=protected_dependencies)
app.include_router(lesson_plans.router, dependencies=protected_dependencies)
