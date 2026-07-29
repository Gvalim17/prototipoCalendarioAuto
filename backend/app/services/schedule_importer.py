"""Importação de cronogramas a partir de planilha (.csv/.xls/.xlsx).

Espera o mesmo layout que o próprio sistema exporta em `/schedules/export/xlsx`
(colunas: Instituição, Nível, Curso, Semestre, Módulo, Disciplina, Formato,
Data, Início, Término — Dia da Semana / Nº da Aula / Carga Horária são
recalculados, não lidos). Cada linha é uma aula; linhas com o mesmo
Curso+Módulo+Disciplina+Formato+Início+Término são agrupadas em um único
cronograma (ScheduleConfig), na mesma lógica de `save_schedule`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time
from io import BytesIO
from pathlib import Path
from typing import Any
import unicodedata

import pandas as pd

from ..models.base import AcademicLevel, DeliveryFormat


MAX_UPLOAD_BYTES = 5 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".csv", ".xls", ".xlsx"}


def _normalize_column(name: Any) -> str:
    raw = str(name or "").strip().lower()
    without_accents = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    return without_accents.replace(" ", "_").replace("-", "_").replace("(h)", "").strip("_")


def _normalize_text(value: Any) -> str:
    raw = str(value or "").strip().lower()
    return unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")


def _clean_text(value: Any, default: str = "") -> str:
    if value is None or pd.isna(value):
        return default
    text = str(value).strip()
    return text if text else default


def _parse_date(value: Any) -> date:
    if value is None or pd.isna(value):
        raise ValueError("data vazia")
    if hasattr(value, "date") and not isinstance(value, str):
        return value.date()
    if isinstance(value, date):
        return value
    raw = str(value).strip()
    first_part = raw[:4]
    is_iso_like = len(raw) >= 10 and first_part.isdigit() and raw[4] in {"-", "/"}
    parsed = pd.to_datetime(raw, dayfirst=not is_iso_like, errors="coerce")
    if pd.isna(parsed):
        raise ValueError(f"data inválida: {raw}")
    return parsed.date()


def _parse_time(value: Any) -> time | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, time):
        return value
    if isinstance(value, datetime):
        return value.time()
    raw = str(value).strip()
    if not raw or raw.lower() == "nan":
        return None
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(raw, fmt).time()
        except ValueError:
            continue
    raise ValueError(f"horário inválido: {raw}")


def _parse_format(value: Any) -> str:
    normalized = _normalize_text(value)
    if normalized.startswith("remot"):
        return DeliveryFormat.REMOTO.value
    return DeliveryFormat.PRESENCIAL.value


_LEVEL_ALIASES = {
    "graduacao": AcademicLevel.GRADUACAO,
    "pos graduacao": AcademicLevel.POS_GRADUACAO,
    "mba": AcademicLevel.MBA,
    "extensao": AcademicLevel.EXTENSAO,
    "tecnico": AcademicLevel.TECNICO,
}


def _parse_academic_level(value: Any) -> tuple[str, str | None]:
    normalized = _normalize_text(value)
    for alias, level in _LEVEL_ALIASES.items():
        if alias in normalized:
            return level.value, None
    label = _clean_text(value)
    return AcademicLevel.OUTRO.value, (label or None)


def _parse_semester(value: Any) -> int | None:
    if value is None or pd.isna(value):
        return None
    try:
        semester = int(float(value))
    except (TypeError, ValueError):
        return None
    return semester if semester in (1, 2) else None


@dataclass
class ParsedClass:
    row_number: int
    date: date
    start_time: time | None
    end_time: time | None


@dataclass
class ScheduleGroup:
    institution: str
    academic_level: str
    academic_level_other: str | None
    course_name: str
    semester: int | None
    module_name: str
    discipline_name: str
    format: str
    classes: list[ParsedClass] = field(default_factory=list)


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


def parse_schedule_file(filename: str, content: bytes) -> dict:
    df = _read_dataframe(filename, content)
    if df.empty:
        raise ValueError("O arquivo está vazio.")

    original_columns = [str(c) for c in df.columns]
    df = df.rename(columns={column: _normalize_column(column) for column in df.columns})

    aliases = {
        "instituicao": "institution",
        "nivel": "academic_level",
        "curso": "course_name",
        "semestre": "semester",
        "modulo": "module_name",
        "disciplina": "discipline_name",
        "formato": "format",
        "data": "date",
        "inicio": "start_time",
        "termino": "end_time",
    }
    df = df.rename(columns={column: aliases.get(column, column) for column in df.columns})

    required = {"course_name", "module_name", "discipline_name", "date"}
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(
            "Colunas obrigatórias ausentes: " + ", ".join(missing)
            + f". Colunas encontradas: {', '.join(original_columns)}"
        )

    groups: dict[tuple, ScheduleGroup] = {}
    errors: list[dict] = []

    for index, row in df.iterrows():
        row_number = int(index) + 2
        if row.isna().all():
            continue

        course_name = _clean_text(row.get("course_name"))
        module_name = _clean_text(row.get("module_name"))
        discipline_name = _clean_text(row.get("discipline_name"))
        if not course_name or not module_name or not discipline_name:
            errors.append({"row": row_number, "field": "curso/modulo/disciplina", "message": "campo obrigatório vazio"})
            continue

        try:
            class_date = _parse_date(row.get("date"))
        except ValueError as exc:
            errors.append({"row": row_number, "field": "data", "message": str(exc)})
            continue

        try:
            start_time = _parse_time(row.get("start_time"))
            end_time = _parse_time(row.get("end_time"))
        except ValueError as exc:
            errors.append({"row": row_number, "field": "horário", "message": str(exc)})
            continue

        fmt = _parse_format(row.get("format"))
        level, level_other = _parse_academic_level(row.get("academic_level"))
        key = (course_name, module_name, discipline_name, fmt, start_time, end_time)
        group = groups.get(key)
        if not group:
            group = ScheduleGroup(
                institution=_clean_text(row.get("institution")) or "",
                academic_level=level,
                academic_level_other=level_other,
                course_name=course_name,
                semester=_parse_semester(row.get("semester")),
                module_name=module_name,
                discipline_name=discipline_name,
                format=fmt,
            )
            groups[key] = group
        group.classes.append(ParsedClass(row_number=row_number, date=class_date, start_time=start_time, end_time=end_time))

    for group in groups.values():
        group.classes.sort(key=lambda c: c.date)

    return {"groups": list(groups.values()), "errors": errors, "total_rows": len(df.index)}
