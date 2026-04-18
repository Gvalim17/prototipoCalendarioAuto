import pytest
from datetime import date
from sqlalchemy.orm import Session
from unittest.mock import MagicMock
from app.models.base import Holiday, Recess, ScheduleConfig, DeliveryFormat, RecurrenceType
from app.services.schedule_generator import ScheduleGeneratorService

def test_generate_weekly_schedule_no_blocks():
    # Setup mock DB
    db = MagicMock(spec=Session)
    db.query.return_value.all.return_value = [] # Sem feriados ou recessos

    # Config de teste: Segunda-feira, 4 aulas semanais
    config = ScheduleConfig(
        start_date=date(2026, 10, 5), # Segunda
        num_classes=4,
        recurrence=RecurrenceType.SEMANAL,
        day_of_week=0 # Segunda
    )

    result = ScheduleGeneratorService.generate_schedule(db, config)
    dates = result["dates"]

    assert len(dates) == 4
    assert dates[0] == date(2026, 10, 5)
    assert dates[1] == date(2026, 10, 12)
    assert dates[2] == date(2026, 10, 19)
    assert dates[3] == date(2026, 10, 26)

def test_generate_schedule_skipping_holiday():
    # Setup mock DB com feriado na segunda aula
    db = MagicMock(spec=Session)
    holiday = Holiday(date=date(2026, 10, 12), description="Feriado Teste")
    db.query.return_value.all.side_effect = [[holiday], []] # 1 feriado, 0 recessos

    config = ScheduleConfig(
        start_date=date(2026, 10, 5),
        num_classes=2,
        recurrence=RecurrenceType.SEMANAL,
        day_of_week=0
    )

    result = ScheduleGeneratorService.generate_schedule(db, config)
    dates = result["dates"]

    assert len(dates) == 2
    assert dates[0] == date(2026, 10, 5)
    # A aula 2 deveria ser dia 12, mas como é feriado, pula para dia 19
    assert dates[1] == date(2026, 10, 19)

def test_generate_schedule_skipping_recess():
    # Setup mock DB com recesso longo
    db = MagicMock(spec=Session)
    recess = Recess(start_date=date(2026, 10, 10), end_date=date(2026, 10, 20))
    db.query.return_value.all.side_effect = [[], [recess]]

    config = ScheduleConfig(
        start_date=date(2026, 10, 5),
        num_classes=2,
        recurrence=RecurrenceType.SEMANAL,
        day_of_week=0
    )

    result = ScheduleGeneratorService.generate_schedule(db, config)
    dates = result["dates"]

    assert len(dates) == 2
    assert dates[0] == date(2026, 10, 5)
    # Dia 12 está dentro do recesso (10-20), pula para dia 19? Não, dia 19 também está no recesso! Pula para dia 26.
    assert dates[1] == date(2026, 10, 26)
