from datetime import date, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from ..models.base import Holiday, Recess, ScheduleConfig, RecurrenceType, HolidayPolicy


class ScheduleGeneratorService:
    @staticmethod
    def is_blocked(check_date: date, holidays: dict, recesses: List[tuple]) -> bool:
        if check_date in holidays:
            return True
        for r_start, r_end, _ in recesses:
            if r_start <= check_date <= r_end:
                return True
        return False

    @staticmethod
    def _blocked_reason(check_date: date, holidays: dict, recesses: List[tuple]) -> Optional[str]:
        if check_date in holidays:
            return f"Feriado: {holidays[check_date]}"
        for r_start, r_end, desc in recesses:
            if r_start <= check_date <= r_end:
                return f"Recesso: {desc or 'Recesso'}"
        return None

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
    def resolve_conflicts(cls, db: Session, config: ScheduleConfig, resolutions: List[dict]) -> dict:
        """Gera o cronograma base e incorpora as datas de reposição informadas."""
        base_result = cls.generate_schedule(db, config)
        dates = list(base_result["dates"])

        for r in resolutions:
            resolved = r.get("resolved_date")
            if resolved:
                dates.append(resolved)

        # Ordena e remove duplicatas
        seen: set = set()
        deduped = [d for d in sorted(dates) if not (d in seen or seen.add(d))]
        return {"dates": deduped, "skipped": base_result["skipped"]}

    @classmethod
    def generate_schedule(cls, db: Session, config: ScheduleConfig) -> dict:
        """Gera as datas de aula dentro da faixa [start_date, end_date] para os
        dias da semana selecionados, respeitando a política de feriados.

        - HolidayPolicy.SKIP: a aula que cair em feriado/recesso é perdida
          (registrada em `skipped` sem sugestão) e o total é reduzido.
        - HolidayPolicy.RESCHEDULE / MANUAL: a aula é retirada da lista e
          registrada em `skipped` com uma `suggested_date` de referência para
          reposição (fluxo interativo). A diferença entre as duas é apenas de
          UX no frontend: RESCHEDULE pré-aceita a sugestão automaticamente,
          MANUAL exige que o professor escolha a data manualmente.
        """
        holidays = {h.date: h.description for h in db.query(Holiday).all()}
        recesses = [(r.start_date, r.end_date, r.description) for r in db.query(Recess).all()]

        policy = config.holiday_policy or HolidayPolicy.RESCHEDULE
        generated_dates: List[date] = []
        skipped_dates: List[dict] = []

        # Evento único (Masterclass / palestra)
        if config.recurrence == RecurrenceType.NA:
            d = config.start_date
            reason = cls._blocked_reason(d, holidays, recesses)
            if reason:
                if policy == HolidayPolicy.SKIP:
                    skipped_dates.append({"date": d, "reason": reason, "suggested_date": None})
                    return {"dates": [], "skipped": skipped_dates}
                suggested = cls.find_next_valid(d + timedelta(days=1), holidays, recesses)
                skipped_dates.append({"date": d, "reason": reason, "suggested_date": suggested})
                return {"dates": [], "skipped": skipped_dates}
            return {"dates": [d], "skipped": []}

        days_set = set(config.days_list)
        if not days_set:
            return {"dates": [], "skipped": []}

        end_date = config.end_date or config.start_date
        # Âncora de paridade de semanas para recorrência quinzenal
        anchor_monday = config.start_date - timedelta(days=config.start_date.weekday())
        biweekly = config.recurrence == RecurrenceType.QUINZENAL

        current = config.start_date
        while current <= end_date:
            if current.weekday() in days_set:
                include = True
                if biweekly:
                    weeks = (current - anchor_monday).days // 7
                    include = weeks % 2 == 0
                if include:
                    reason = cls._blocked_reason(current, holidays, recesses)
                    if reason:
                        suggested = None
                        if policy != HolidayPolicy.SKIP:
                            suggested = cls.find_next_valid(current + timedelta(days=1), holidays, recesses)
                        skipped_dates.append({
                            "date": current,
                            "reason": reason,
                            "suggested_date": suggested,
                        })
                    else:
                        generated_dates.append(current)
            current += timedelta(days=1)

        return {"dates": generated_dates, "skipped": skipped_dates}
