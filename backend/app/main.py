import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .logging_config import get_logger, setup_logging
from .middleware.request_logging import RequestLoggingMiddleware
from .dependencies import get_current_user, require_csrf
from .routers import academic, alerts, auth, holidays, lesson_plans, logs, recesses, schedules, users


setup_logging()
logger = get_logger()

init_db()
logger.info("Aplicação inicializada", extra={"event": "startup"})

app = FastAPI(title="Calendário Acadêmico · Sistema de Cronogramas")

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
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)


@app.get("/")
def read_root():
    return {"status": "online", "message": "API de Calendário Acadêmico"}


app.include_router(auth.router)
app.include_router(alerts.system_router)
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
