import json
from typing import List, Optional

from fastapi import APIRouter, Depends, Query

from ..dependencies import require_admin_action
from ..logging_config import LOG_FILE
from ..schemas.base_schemas import LogEntry


router = APIRouter()


_TAIL_CHUNK_SIZE = 64 * 1024


def _read_last_lines(path, limit: int) -> List[str]:
    """Lê as últimas `limit` linhas do arquivo de log ativo, de trás para
    frente em blocos — sem isso, toda chamada lia o arquivo inteiro (até 5MB)
    do início ao fim, mesmo para pedir só as últimas 200 linhas."""
    if not path.exists():
        return []
    with open(path, "rb") as f:
        f.seek(0, 2)
        pos = f.tell()
        data = b""
        newline_count = 0
        while pos > 0 and newline_count <= limit:
            read_size = min(_TAIL_CHUNK_SIZE, pos)
            pos -= read_size
            f.seek(pos)
            data = f.read(read_size) + data
            newline_count = data.count(b"\n")
    text = data.decode("utf-8", errors="replace")
    lines = [ln for ln in (line.strip() for line in text.splitlines()) if ln]
    return lines[-limit:]


@router.get("/logs/", response_model=List[LogEntry], dependencies=[Depends(require_admin_action)])
def list_logs(
    limit: int = Query(200, ge=1, le=2000),
    level: Optional[str] = Query(None, description="Filtra por nível: INFO, WARNING, ERROR"),
    event: Optional[str] = Query(None, max_length=100),
    request_id: Optional[str] = Query(None, max_length=64),
    status_code: Optional[int] = Query(None, ge=100, le=599),
):
    raw_lines = _read_last_lines(LOG_FILE, limit=limit if not level else limit * 5)
    entries: List[dict] = []
    for line in raw_lines:
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    if level:
        entries = [e for e in entries if e.get("level", "").upper() == level.upper()]
    if event:
        entries = [e for e in entries if e.get("event") == event]
    if request_id:
        entries = [e for e in entries if e.get("request_id") == request_id]
    if status_code:
        entries = [e for e in entries if e.get("status_code") == status_code]

    entries = entries[-limit:]
    entries.reverse()  # mais recente primeiro
    return entries
