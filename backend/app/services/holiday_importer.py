from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path
from typing import Any
import re
import unicodedata

import pandas as pd
from sqlalchemy.orm import Session

from ..models.base import Holiday


MAX_UPLOAD_BYTES = 5 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".csv", ".xls", ".xlsx"}


@dataclass
class ParsedHoliday:
    row_number: int
    date: date
    description: str
    type: str
    source: str


def _normalize_column(name: Any) -> str:
    raw = str(name or "").strip().lower()
    without_accents = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    return without_accents.replace(" ", "_").replace("-", "_")


def _normalize_text(value: Any) -> str:
    raw = str(value or "").strip().lower()
    return unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")


def _clean_text(value: Any, default: str = "") -> str:
    if value is None or pd.isna(value):
        return default
    text = str(value).strip()
    return text if text else default


def _easter_date(year: int) -> date:
    """Computes Gregorian Easter Sunday for the given year."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _is_movable_marker(value: Any) -> bool:
    return _normalize_text(value) in {"data movel", "movel", "móvel"}


def _movable_date(description: str, year: int) -> date:
    name = _normalize_text(description)
    easter = _easter_date(year)

    if "corpus" in name:
        return easter + timedelta(days=60)
    if "sexta" in name and ("santa" in name or "paixao" in name):
        return easter - timedelta(days=2)
    if "quarta" in name and "cinzas" in name:
        return easter - timedelta(days=46)
    if "segunda" in name and "carnaval" in name:
        return easter - timedelta(days=48)
    if "carnaval" in name:
        return easter - timedelta(days=47)

    raise ValueError(f"data móvel não reconhecida para '{description}'")


def _parse_date(value: Any, default_year: int) -> date:
    if value is None or pd.isna(value):
        raise ValueError("data vazia")

    if hasattr(value, "date") and not isinstance(value, str):
        return value.date()

    if isinstance(value, date):
        return value

    raw = str(value).strip()
    if not raw:
        raise ValueError("data vazia")

    short_date = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})", raw)
    if short_date:
        day, month = (int(part) for part in short_date.groups())
        return date(default_year, month, day)

    first_part = raw[:4]
    is_iso_like = len(raw) >= 10 and first_part.isdigit() and raw[4] in {"-", "/"}
    parsed = pd.to_datetime(raw, dayfirst=not is_iso_like, errors="coerce")

    if pd.isna(parsed):
        raise ValueError(f"data inválida: {raw}")

    return parsed.date()


def _read_dataframe(filename: str, content: bytes) -> pd.DataFrame:
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("Arquivo muito grande. O limite é 5 MB.")

    extension = Path(filename or "").suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError("Formato de arquivo não suportado. Use CSV, XLS ou XLSX.")

    buffer = BytesIO(content)
    if extension == ".csv":
        return pd.read_csv(buffer)
    return pd.read_excel(buffer)


def parse_holiday_file(filename: str, content: bytes, default_year: int = 2026) -> dict:
    if default_year < 1900 or default_year > 2200:
        raise ValueError("Ano inválido para importação.")

    df = _read_dataframe(filename, content)
    if df.empty:
        raise ValueError("O arquivo está vazio.")

    original_columns = [str(c) for c in df.columns]
    df = df.rename(columns={column: _normalize_column(column) for column in df.columns})

    aliases = {
        "data": "date",
        "date": "date",
        "descricao": "description",
        "description": "description",
        "feriado": "description",
        "nome": "description",
        "tipo": "type",
        "type": "type",
        "esfera": "source",
        "origem": "source",
        "fonte": "source",
        "source": "source",
        "observacao": "notes",
        "observacoes": "notes",
    }
    df = df.rename(columns={column: aliases.get(column, column) for column in df.columns})

    required = {"date", "description"}
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(
            "Colunas obrigatórias ausentes: "
            + ", ".join(missing)
            + f". Colunas encontradas: {', '.join(original_columns)}"
        )

    parsed: list[ParsedHoliday] = []
    errors: list[dict] = []

    for index, row in df.iterrows():
        row_number = int(index) + 2
        if row.isna().all():
            continue

        description = _clean_text(row.get("description"))
        if not description:
            errors.append({"row": row_number, "field": "description", "message": "descrição vazia"})
            continue

        try:
            if _is_movable_marker(row.get("date")):
                holiday_date = _movable_date(description, default_year)
            else:
                holiday_date = _parse_date(row.get("date"), default_year)
        except ValueError as exc:
            errors.append({"row": row_number, "field": "date", "message": str(exc)})
            continue

        source = _clean_text(row.get("source"), "Importação")
        notes = _clean_text(row.get("notes"))
        if notes and notes != source:
            source = f"{source} - {notes}"

        parsed.append(
            ParsedHoliday(
                row_number=row_number,
                date=holiday_date,
                description=description,
                type=_clean_text(row.get("type"), "feriado").lower(),
                source=source,
            )
        )

    return {
        "rows": parsed,
        "errors": errors,
        "total_rows": len(df.index),
        "columns": original_columns,
    }


def import_holidays(db: Session, rows: list[ParsedHoliday], errors: list[dict]) -> dict:
    created = 0
    updated = 0
    unchanged = 0

    existing = {holiday.date: holiday for holiday in db.query(Holiday).all()}

    for row in rows:
        holiday = existing.get(row.date)
        if holiday:
            changed = (
                holiday.description != row.description
                or holiday.type != row.type
                or holiday.source != row.source
            )
            if changed:
                holiday.description = row.description
                holiday.type = row.type
                holiday.source = row.source
                updated += 1
            else:
                unchanged += 1
            continue

        holiday = Holiday(
            date=row.date,
            description=row.description,
            type=row.type,
            source=row.source,
        )
        db.add(holiday)
        existing[row.date] = holiday
        created += 1

    db.commit()

    failed = len(errors)
    processed = created + updated + unchanged
    return {
        "message": f"Importação concluída: {created} criados, {updated} atualizados, {unchanged} sem alteração, {failed} com erro.",
        "total": processed,
        "total_rows": processed + failed,
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "failed": failed,
        "errors": errors[:25],
    }
