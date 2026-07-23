import pytest
from datetime import date, timedelta
from sqlalchemy.orm import Session
from unittest.mock import MagicMock
from app.models.base import Holiday, Recess, ScheduleConfig, RecurrenceType, HolidayPolicy
from app.services.schedule_generator import ScheduleGeneratorService


def _make_db(holidays=None, recesses=None):
    """Mock DB que retorna feriados e recessos dados."""
    db = MagicMock(spec=Session)
    db.query.return_value.all.side_effect = [
        holidays or [],
        recesses or [],
    ]
    return db


def _config(**kwargs):
    defaults = dict(
        recurrence=RecurrenceType.SEMANAL,
        holiday_policy=HolidayPolicy.RESCHEDULE,
    )
    defaults.update(kwargs)
    return ScheduleConfig(**defaults)


# ── RF-06: Geração por faixa de datas ────────────────────────────────────────

def test_generate_weekly_single_day():
    db = _make_db()
    config = _config(
        start_date=date(2026, 10, 5),   # Segunda
        end_date=date(2026, 10, 26),    # Segunda
        days_of_week="0",
    )
    dates = ScheduleGeneratorService.generate_schedule(db, config)["dates"]
    assert dates == [
        date(2026, 10, 5), date(2026, 10, 12),
        date(2026, 10, 19), date(2026, 10, 26),
    ]


def test_generate_weekly_multiple_days():
    """Segunda (0) e Quarta (2) na mesma semana."""
    db = _make_db()
    config = _config(
        start_date=date(2026, 10, 5),   # Segunda
        end_date=date(2026, 10, 14),    # Quarta
        days_of_week="0,2",
    )
    dates = ScheduleGeneratorService.generate_schedule(db, config)["dates"]
    assert dates == [
        date(2026, 10, 5), date(2026, 10, 7),
        date(2026, 10, 12), date(2026, 10, 14),
    ]


def test_generate_quinzenal():
    db = _make_db()
    config = _config(
        start_date=date(2026, 3, 7),    # Sábado
        end_date=date(2026, 4, 4),
        days_of_week="5",
        recurrence=RecurrenceType.QUINZENAL,
    )
    dates = ScheduleGeneratorService.generate_schedule(db, config)["dates"]
    assert dates == [date(2026, 3, 7), date(2026, 3, 21), date(2026, 4, 4)]


def test_generate_single_event_na():
    db = _make_db()
    config = _config(
        start_date=date(2026, 5, 15),
        recurrence=RecurrenceType.NA,
        days_of_week="",
    )
    dates = ScheduleGeneratorService.generate_schedule(db, config)["dates"]
    assert dates == [date(2026, 5, 15)]


# ── Política de feriado ──────────────────────────────────────────────────────

def test_skip_policy_drops_class_and_reduces_total():
    holiday = Holiday(date=date(2026, 10, 12), description="Feriado Teste")
    db = _make_db(holidays=[holiday])
    config = _config(
        start_date=date(2026, 10, 5),
        end_date=date(2026, 10, 26),
        days_of_week="0",
        holiday_policy=HolidayPolicy.SKIP,
    )
    result = ScheduleGeneratorService.generate_schedule(db, config)
    assert result["dates"] == [date(2026, 10, 5), date(2026, 10, 19), date(2026, 10, 26)]
    assert len(result["skipped"]) == 1
    assert result["skipped"][0]["date"] == date(2026, 10, 12)
    assert result["skipped"][0]["suggested_date"] is None


def test_reschedule_policy_suggests_replacement():
    holiday = Holiday(date=date(2026, 10, 12), description="Feriado Nacional")
    db = _make_db(holidays=[holiday])
    config = _config(
        start_date=date(2026, 10, 5),
        end_date=date(2026, 10, 26),
        days_of_week="0",
        holiday_policy=HolidayPolicy.RESCHEDULE,
    )
    result = ScheduleGeneratorService.generate_schedule(db, config)
    # A data do feriado sai da lista principal e vira sugestão de reposição
    assert date(2026, 10, 12) not in result["dates"]
    assert len(result["skipped"]) == 1
    assert "Feriado Nacional" in result["skipped"][0]["reason"]
    assert result["skipped"][0]["suggested_date"] == date(2026, 10, 13)


def test_recess_blocks_range():
    recess = Recess(start_date=date(2026, 10, 10), end_date=date(2026, 10, 20))
    db = _make_db(recesses=[recess])
    config = _config(
        start_date=date(2026, 10, 5),
        end_date=date(2026, 10, 26),
        days_of_week="0",
        holiday_policy=HolidayPolicy.SKIP,
    )
    result = ScheduleGeneratorService.generate_schedule(db, config)
    assert result["dates"] == [date(2026, 10, 5), date(2026, 10, 26)]


# ── is_blocked / find_next_valid ─────────────────────────────────────────────

def test_is_blocked_by_holiday():
    holidays = {date(2026, 11, 2): "Finados"}
    assert ScheduleGeneratorService.is_blocked(date(2026, 11, 2), holidays, []) is True
    assert ScheduleGeneratorService.is_blocked(date(2026, 11, 3), holidays, []) is False


def test_is_blocked_by_recess_boundaries():
    recess_tuple = (date(2026, 7, 6), date(2026, 7, 17), "Recesso Julho")
    assert ScheduleGeneratorService.is_blocked(date(2026, 7, 6), {}, [recess_tuple]) is True
    assert ScheduleGeneratorService.is_blocked(date(2026, 7, 17), {}, [recess_tuple]) is True
    assert ScheduleGeneratorService.is_blocked(date(2026, 7, 5), {}, [recess_tuple]) is False
    assert ScheduleGeneratorService.is_blocked(date(2026, 7, 18), {}, [recess_tuple]) is False


def test_find_next_valid_skips_holiday():
    holidays = {date(2026, 10, 12): "Feriado"}
    result = ScheduleGeneratorService.find_next_valid(date(2026, 10, 12), holidays, [])
    assert result == date(2026, 10, 13)


def test_find_next_valid_returns_none_when_all_blocked():
    start = date(2026, 1, 1)
    holidays = {start + timedelta(days=i): "blk" for i in range(10)}
    result = ScheduleGeneratorService.find_next_valid(start, holidays, [], max_search=5)
    assert result is None


# ── resolve_conflicts ────────────────────────────────────────────────────────

def test_resolve_conflicts_adds_replacement_date():
    holiday = Holiday(date=date(2026, 10, 12), description="Feriado Nacional")
    db = _make_db(holidays=[holiday])
    config = _config(
        start_date=date(2026, 10, 5),
        end_date=date(2026, 10, 26),
        days_of_week="0",
        holiday_policy=HolidayPolicy.RESCHEDULE,
    )
    result = ScheduleGeneratorService.resolve_conflicts(db, config, [{
        "original_date": date(2026, 10, 12),
        "action": "manual",
        "resolved_date": date(2026, 10, 13),
    }])
    assert result["dates"] == [
        date(2026, 10, 5),
        date(2026, 10, 13),
        date(2026, 10, 19),
        date(2026, 10, 26),
    ]
