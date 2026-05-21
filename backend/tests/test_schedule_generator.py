import pytest
from datetime import date, timedelta
from sqlalchemy.orm import Session
from unittest.mock import MagicMock
from app.models.base import Holiday, Recess, ScheduleConfig, RecurrenceType
from app.services.schedule_generator import ScheduleGeneratorService


def _make_db(holidays=None, recesses=None):
    """Mock DB que retorna feriados e recessos dados."""
    db = MagicMock(spec=Session)
    db.query.return_value.all.side_effect = [
        holidays or [],
        recesses or [],
    ]
    return db


# ── RF-06: Geração de cronograma ─────────────────────────────────────────────

def test_generate_weekly_schedule_no_blocks():
    db = _make_db()
    config = ScheduleConfig(
        start_date=date(2026, 10, 5),  # Segunda
        num_classes=4,
        recurrence=RecurrenceType.SEMANAL,
        day_of_week=0,
    )
    result = ScheduleGeneratorService.generate_schedule(db, config)
    dates = result["dates"]
    assert len(dates) == 4
    assert dates[0] == date(2026, 10, 5)
    assert dates[1] == date(2026, 10, 12)
    assert dates[2] == date(2026, 10, 19)
    assert dates[3] == date(2026, 10, 26)


def test_generate_quinzenal_schedule_no_blocks():
    db = _make_db()
    config = ScheduleConfig(
        start_date=date(2026, 3, 7),  # Sábado
        num_classes=3,
        recurrence=RecurrenceType.QUINZENAL,
        day_of_week=5,
    )
    result = ScheduleGeneratorService.generate_schedule(db, config)
    dates = result["dates"]
    assert len(dates) == 3
    assert dates[0] == date(2026, 3, 7)
    assert dates[1] == date(2026, 3, 21)
    assert dates[2] == date(2026, 4, 4)


def test_generate_master_class_single_date():
    """RecurrenceType.NA é usado para Masterclass (evento único)."""
    db = _make_db()
    config = ScheduleConfig(
        start_date=date(2026, 5, 15),
        num_classes=1,
        recurrence=RecurrenceType.NA,
        day_of_week=4,
    )
    result = ScheduleGeneratorService.generate_schedule(db, config)
    dates = result["dates"]
    assert len(dates) == 1
    assert dates[0] == date(2026, 5, 15)


# ── RF-07/RF-08: Detecção e sugestão de conflitos ────────────────────────────

def test_generate_schedule_skipping_holiday():
    holiday = Holiday(date=date(2026, 10, 12), description="Feriado Teste")
    db = _make_db(holidays=[holiday])
    config = ScheduleConfig(
        start_date=date(2026, 10, 5),
        num_classes=2,
        recurrence=RecurrenceType.SEMANAL,
        day_of_week=0,
    )
    result = ScheduleGeneratorService.generate_schedule(db, config)
    dates = result["dates"]
    assert len(dates) == 2
    assert dates[0] == date(2026, 10, 5)
    assert dates[1] == date(2026, 10, 19)


def test_generate_schedule_skipping_recess():
    recess = Recess(start_date=date(2026, 10, 10), end_date=date(2026, 10, 20))
    db = _make_db(recesses=[recess])
    config = ScheduleConfig(
        start_date=date(2026, 10, 5),
        num_classes=2,
        recurrence=RecurrenceType.SEMANAL,
        day_of_week=0,
    )
    result = ScheduleGeneratorService.generate_schedule(db, config)
    dates = result["dates"]
    assert len(dates) == 2
    assert dates[0] == date(2026, 10, 5)
    assert dates[1] == date(2026, 10, 26)


def test_skipped_dates_populated():
    """Verifica que skipped contém motivo e suggested_date."""
    holiday = Holiday(date=date(2026, 10, 12), description="Feriado Nacional")
    db = _make_db(holidays=[holiday])
    config = ScheduleConfig(
        start_date=date(2026, 10, 5),
        num_classes=2,
        recurrence=RecurrenceType.SEMANAL,
        day_of_week=0,
    )
    result = ScheduleGeneratorService.generate_schedule(db, config)
    skipped = result["skipped"]
    assert len(skipped) == 1
    assert skipped[0]["date"] == date(2026, 10, 12)
    assert "Feriado Nacional" in skipped[0]["reason"]
    assert skipped[0]["suggested_date"] == date(2026, 10, 19)


# ── is_blocked (recebe tuples, não ORM) ──────────────────────────────────────

def test_is_blocked_by_holiday():
    holidays = {date(2026, 11, 2): "Finados"}
    assert ScheduleGeneratorService.is_blocked(date(2026, 11, 2), holidays, []) is True
    assert ScheduleGeneratorService.is_blocked(date(2026, 11, 3), holidays, []) is False


def test_is_blocked_by_recess_boundaries():
    # is_blocked recebe tuples (start, end, desc) — como generate_schedule passa
    recess_tuple = (date(2026, 7, 6), date(2026, 7, 17), "Recesso Julho")
    assert ScheduleGeneratorService.is_blocked(date(2026, 7, 6), {}, [recess_tuple]) is True
    assert ScheduleGeneratorService.is_blocked(date(2026, 7, 17), {}, [recess_tuple]) is True
    assert ScheduleGeneratorService.is_blocked(date(2026, 7, 5), {}, [recess_tuple]) is False
    assert ScheduleGeneratorService.is_blocked(date(2026, 7, 18), {}, [recess_tuple]) is False


# ── find_next_valid ───────────────────────────────────────────────────────────

def test_find_next_valid_skips_holiday():
    holidays = {date(2026, 10, 12): "Feriado"}
    result = ScheduleGeneratorService.find_next_valid(date(2026, 10, 12), holidays, [])
    assert result == date(2026, 10, 13)


def test_find_next_valid_returns_none_when_all_blocked():
    start = date(2026, 1, 1)
    holidays = {start + timedelta(days=i): "blk" for i in range(10)}
    result = ScheduleGeneratorService.find_next_valid(start, holidays, [], max_search=5)
    assert result is None
