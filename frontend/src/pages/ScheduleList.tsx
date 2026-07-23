import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Pencil, Trash2, Clock, RefreshCw, NotebookPen } from 'lucide-react';
import api from '../api/client';
import { WEEKDAYS, type ScheduleConfigRead } from '../types/domain';

const RECURRENCE_LABEL: Record<string, string> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  na: 'Evento único',
};

const POLICY_LABEL: Record<string, string> = {
  reschedule: 'Remarcar automaticamente',
  manual: 'Remarcar manualmente',
  skip: 'Não remarcar',
};

const formatDate = (d?: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const formatWeekdays = (days?: number[]) => {
  if (!days?.length) return 'Dia único';
  const labels = days
    .map((day) => WEEKDAYS.find((weekday) => weekday.value === day)?.short)
    .filter(Boolean);

  if (labels.length === 0) return '—';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
};

const ScheduleList = () => {
  const [configs, setConfigs] = useState<ScheduleConfigRead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await api.get<ScheduleConfigRead[]>(`/schedules/configs/`);
      setConfigs(res.data);
    } catch (err) {
      console.error('Erro ao buscar cronogramas:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteConfig = async (id: number) => {
    if (window.confirm('Excluir este cronograma? Todas as aulas geradas serão removidas.')) {
      try {
        await api.delete(`/schedules/${id}`);
        fetchConfigs();
      } catch {
        alert('Erro ao excluir cronograma.');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink tracking-tight">Cronogramas</h2>
          <p className="text-muted mt-1 text-sm">Cronogramas gerados por disciplina. Edite para regenerar com novas datas.</p>
        </div>
        <Link to="/generate" className="btn-primary">
          <CalendarDays size={18} /> Novo cronograma
        </Link>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted">Carregando cronogramas...</div>
      ) : configs.length === 0 ? (
        <div className="card border-dashed py-16 text-center">
          <CalendarDays size={40} className="mx-auto text-faint mb-3" />
          <p className="text-muted">Nenhum cronograma gerado ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {configs.map((c) => (
            <div key={c.id} className="card p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink truncate">{c.discipline_name}</h3>
                  <p className="text-xs text-muted mt-0.5 truncate">{c.course_name} · {c.module_name}</p>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-md shrink-0 ${c.format === 'presencial' ? 'bg-ok/10 text-ok' : 'bg-accent/10 text-accent'}`}>
                  {c.format === 'presencial' ? 'Presencial' : 'Remoto'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-muted mt-2">
                <span className="flex items-center gap-1.5"><CalendarDays size={13} /> {formatDate(c.start_date)} – {formatDate(c.end_date)}</span>
                <span className="flex items-center gap-1.5"><RefreshCw size={13} /> {RECURRENCE_LABEL[c.recurrence] || c.recurrence}</span>
                <span className="flex items-center gap-1.5"><CalendarDays size={13} /> {formatWeekdays(c.days_of_week)}</span>
                {(c.start_time || c.end_time) && (
                  <span className="flex items-center gap-1.5"><Clock size={13} /> {c.start_time?.slice(0, 5)} – {c.end_time?.slice(0, 5)}</span>
                )}
                <span>{POLICY_LABEL[c.holiday_policy] || c.holiday_policy}</span>
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-line">
                <span className="text-xs text-muted">{c.num_classes ?? 0} aulas · {c.workload ?? 0}h</span>
                <div className="flex gap-1">
                  <Link to={`/schedules/${c.id}/plan`} title="Planejar aulas" className="p-2 text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors">
                    <NotebookPen size={16} />
                  </Link>
                  <Link to={`/generate/${c.id}`} title="Editar cronograma" className="p-2 text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors">
                    <Pencil size={16} />
                  </Link>
                  <button onClick={() => deleteConfig(c.id)} className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ScheduleList;
