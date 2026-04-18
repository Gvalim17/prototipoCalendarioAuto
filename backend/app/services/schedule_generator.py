from datetime import date, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from ..models.base import Holiday, Recess, ScheduleConfig, RecurrenceType

class ScheduleGeneratorService:
    @staticmethod
    def is_blocked(check_date: date, holidays: dict, recesses: List[tuple]) -> bool:
        if check_date in holidays:
            return True
        for r_start, r_end, _ in recesses:
            if r_start <= check_date <= r_end:
                return True
        return False

    @classmethod
    def find_next_valid(cls, from_date: date, holidays: dict, recesses: List[tuple], max_search: int = 60) -> Optional[date]:
        """Encontra a próxima data válida (não bloqueada) a partir de from_date."""
        candidate = from_date
        for _ in range(max_search):
            if not cls.is_blocked(candidate, holidays, recesses):
                return candidate
            candidate += timedelta(days=1)
        return None

    @classmethod
    def generate_schedule(cls, db: Session, config: ScheduleConfig) -> dict:
        holidays = {h.date: h.description for h in db.query(Holiday).all()}
        recesses = [(r.start_date, r.end_date, r.description) for r in db.query(Recess).all()]

        generated_dates = []
        skipped_dates = []
        current_date = config.start_date

        if config.recurrence == RecurrenceType.NA:
            is_holiday_desc = holidays.get(current_date)
            recess_match = next(((s, e, desc) for s, e, desc in recesses if s <= current_date <= e), None)
            recess_desc = recess_match[2] if recess_match else None

            if is_holiday_desc:
                suggested = cls.find_next_valid(current_date + timedelta(days=1), holidays, recesses)
                skipped_dates.append({
                    "date": current_date,
                    "reason": f"Feriado: {is_holiday_desc}",
                    "suggested_date": suggested
                })
                return {"dates": [], "skipped": skipped_dates}
            if recess_match:
                suggested = cls.find_next_valid(current_date + timedelta(days=1), holidays, recesses)
                skipped_dates.append({
                    "date": current_date,
                    "reason": f"Recesso: {recess_desc or 'Recesso'}",
                    "suggested_date": suggested
                })
                return {"dates": [], "skipped": skipped_dates}

            return {"dates": [current_date], "skipped": []}

        increment_days = 7 if config.recurrence == RecurrenceType.SEMANAL else 14
        classes_count = 0
        max_attempts = 1000
        attempts = 0

        diff = (config.day_of_week - current_date.weekday() + 7) % 7
        current_date += timedelta(days=diff)

        while classes_count < config.num_classes and attempts < max_attempts:
            attempts += 1

            is_holiday_desc = holidays.get(current_date)
            recess_match = next(((s, e, desc) for s, e, desc in recesses if s <= current_date <= e), None)

            if is_holiday_desc or recess_match:
                reason = f"Feriado: {is_holiday_desc}" if is_holiday_desc else f"Recesso: {recess_match[2] or 'Recesso'}"
                next_occurrence = current_date + timedelta(days=increment_days)
                suggested = cls.find_next_valid(next_occurrence, holidays, recesses)
                skipped_dates.append({
                    "date": current_date,
                    "reason": reason,
                    "suggested_date": suggested
                })
                current_date += timedelta(days=increment_days)
                continue

            generated_dates.append(current_date)
            classes_count += 1
            current_date += timedelta(days=increment_days)

        return {"dates": generated_dates, "skipped": skipped_dates}
