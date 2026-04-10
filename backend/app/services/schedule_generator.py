from datetime import date, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from ..models.base import Holiday, Recess, ScheduleConfig, RecurrenceType

class ScheduleGeneratorService:
    @staticmethod
    def is_blocked(check_date: date, holidays: List[date], recesses: List[tuple]) -> bool:
        """
        Verifica se a data está bloqueada por feriado ou recesso.
        Regra: Nenhuma aula pode ser gerada em feriados ou recessos institucionais (UERJ).
        """
        # Verifica feriados
        if check_date in holidays:
            return True
        
        # Verifica recessos (start_date <= check_date <= end_date)
        for r_start, r_end in recesses:
            if r_start <= check_date <= r_end:
                return True
        
        return False

    @classmethod
    def generate_schedule(cls, db: Session, config: ScheduleConfig) -> dict:
        """
        Gera a lista de datas das aulas baseada na configuração.
        Core do sistema: Pula automaticamente feriados e recessos.
        Retorna dicionário com datas válidas e log de datas puladas.
        """
        holidays = {h.date: h.description for h in db.query(Holiday).all()}
        recesses = [(r.start_date, r.end_date, r.description) for r in db.query(Recess).all()]
        
        generated_dates = []
        skipped_dates = []
        current_date = config.start_date
        
        if config.recurrence == RecurrenceType.NA:
            # Lógica para Evento Único
            is_holiday_desc = holidays.get(current_date)
            recess_desc = next((desc for s, e, desc in recesses if s <= current_date <= e), None)
            
            if is_holiday_desc:
                skipped_dates.append({"date": current_date, "reason": f"Feriado: {is_holiday_desc}"})
                return {"dates": [], "skipped": skipped_dates}
            if recess_desc:
                skipped_dates.append({"date": current_date, "reason": f"Recesso: {recess_desc}"})
                return {"dates": [], "skipped": skipped_dates}
            
            return {"dates": [current_date], "skipped": []}

        increment_days = 7 if config.recurrence == RecurrenceType.SEMANAL else 14
        classes_count = 0
        max_attempts = 1000
        attempts = 0

        # Primeiro, ajusta para o dia da semana correto se necessário no início
        diff = (config.day_of_week - current_date.weekday() + 7) % 7
        current_date += timedelta(days=diff)

        while classes_count < config.num_classes and attempts < max_attempts:
            attempts += 1
            
            # Verifica bloqueios
            is_holiday_desc = holidays.get(current_date)
            recess_desc = next((desc for s, e, desc in recesses if s <= current_date <= e), None)

            if is_holiday_desc or recess_desc:
                reason = f"Feriado: {is_holiday_desc}" if is_holiday_desc else f"Recesso: {recess_desc}"
                skipped_dates.append({"date": current_date, "reason": reason})
                current_date += timedelta(days=increment_days)
                continue
            
            generated_dates.append(current_date)
            classes_count += 1
            current_date += timedelta(days=increment_days)

        return {"dates": generated_dates, "skipped": skipped_dates}
