import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft } from 'lucide-react';
import api from '../api/client';
import type { CalendarEvent } from '../types/domain';
import { WEEKDAYS } from '../types/domain';
import LessonCard from '../components/LessonCard';
import MiniWeekCalendar from '../components/MiniWeekCalendar';
import { useToast } from '../contexts/ToastContext';

const getErrorMessage = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
  return detail || 'Não foi possível concluir a operação.';
};

const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const startOfWeek = (weekOffset: number): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday + weekOffset * 7);
  return d;
};

const WeeklyView = () => {
  const toast = useToast();
  const [classes, setClasses] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    api.get<CalendarEvent[]>('/schedules/')
      .then((res) => setClasses(res.data))
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weekDays = useMemo(() => {
    const monday = startOfWeek(weekOffset);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return date;
    });
  }, [weekOffset]);

  const rangeLabel = useMemo(() => {
    const first = weekDays[0], last = weekDays[6];
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    return `${fmt(first)} – ${fmt(last)} de ${last.getFullYear()}`;
  }, [weekDays]);

  const isCurrentWeek = weekOffset === 0;

  const classesByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const day of weekDays) map.set(toKey(day), []);
    for (const c of classes) {
      const list = map.get(c.date.split('T')[0]);
      if (list) list.push(c);
    }
    for (const list of map.values()) list.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    return map;
  }, [classes, weekDays]);

  const totalThisWeek = useMemo(() => Array.from(classesByDay.values()).reduce((acc, l) => acc + l.length, 0), [classesByDay]);

  const selectClass = (id: number) => {
    setExpandedId(id);
    document.getElementById(`lesson-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (loading) return <div className="flex items-center justify-center h-96 text-muted animate-pulse">Carregando semana...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink tracking-tight">Minha Semana</h2>
          <p className="text-muted mt-1 text-sm">Aulas dia a dia — acesse, adicione e compartilhe o material de cada uma.</p>
        </div>
        <div className="flex items-center gap-2">
          {!isCurrentWeek && (
            <button onClick={() => setWeekOffset(0)} className="btn-ghost h-9 text-xs"><ChevronsLeft size={14} /> Semana atual</button>
          )}
          <div className="flex items-center bg-surface-2 border border-line rounded-xl">
            <button onClick={() => setWeekOffset((w) => w - 1)} className="w-9 h-9 flex items-center justify-center text-muted hover:text-ink transition-colors" aria-label="Semana anterior">
              <ChevronLeft size={18} />
            </button>
            <span className="px-3 text-sm font-medium text-ink capitalize whitespace-nowrap">{rangeLabel}</span>
            <button onClick={() => setWeekOffset((w) => w + 1)} className="w-9 h-9 flex items-center justify-center text-muted hover:text-ink transition-colors" aria-label="Próxima semana">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {totalThisWeek === 0 ? (
        <div className="card border-dashed py-16 text-center">
          <p className="text-muted text-sm">Nenhuma aula agendada nesta semana.</p>
        </div>
      ) : (
        <>
          <MiniWeekCalendar weekDays={weekDays} classesByDay={classesByDay} onSelectClass={selectClass} />
          <div className="space-y-5">
          {weekDays.map((day, i) => {
            const key = toKey(day);
            const dayClasses = classesByDay.get(key) || [];
            const isToday = key === toKey(new Date());
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-baseline gap-2 px-1">
                  <h3 className={`text-sm font-semibold ${isToday ? 'text-accent' : 'text-ink'}`}>{WEEKDAYS[i].label}</h3>
                  <span className="text-xs text-muted">{day.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</span>
                  {isToday && <span className="text-[10px] uppercase font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded">Hoje</span>}
                </div>
                {dayClasses.length === 0 ? (
                  <div className="card border-dashed py-4 px-4">
                    <p className="text-xs text-muted italic">Sem aulas neste dia.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dayClasses.map((c) => (
                      <div key={c.id} id={`lesson-${c.id}`}>
                        <LessonCard
                          lesson={c}
                          configId={c.config_id}
                          startTime={c.start_time}
                          endTime={c.end_time}
                          expanded={expandedId === c.id}
                          onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
                          onDateChanged={(classId, newDate, status, reason) =>
                            setClasses((prev) => prev.map((cl) => cl.id === classId ? { ...cl, date: newDate, status, change_reason: reason } : cl))
                          }
                          subtitle={
                            <p className="text-xs text-muted mt-0.5">
                              {c.discipline_name} · {c.course_name}
                              {c.start_time && <> · {c.start_time.slice(0, 5)}{c.end_time && `–${c.end_time.slice(0, 5)}`}</>}
                            </p>
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </>
      )}
    </div>
  );
};

export default WeeklyView;
