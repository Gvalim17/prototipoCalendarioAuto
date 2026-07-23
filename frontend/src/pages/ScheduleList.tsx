import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Pencil, Trash2, Clock, RefreshCw, NotebookPen, Filter, Building2 } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { ACADEMIC_LEVELS, levelLabel, WEEKDAYS, type ScheduleConfigRead } from '../types/domain';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

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

// Formata horas decimais (ex: 1.6666h) como "1h40" em vez do número cru.
const formatHours = (hours?: number | null) => {
  const totalMinutes = Math.round((hours ?? 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
};

const formatWeekdays = (days?: number[]) => {
  if (!days?.length) return 'Dia único';
  const labels = days
    .map((day) => WEEKDAYS.find((weekday) => weekday.value === day)?.short)
    .filter(Boolean);

  if (labels.length === 0) return '—';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
};

const ALL = '__all__';

const ScheduleList = () => {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<ScheduleConfigRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [institutionFilter, setInstitutionFilter] = useState(ALL);
  const [formatFilter, setFormatFilter] = useState(ALL);
  const [courseFilter, setCourseFilter] = useState(ALL);
  const [levelFilter, setLevelFilter] = useState(ALL);
  const [professorFilter, setProfessorFilter] = useState(ALL);
  const toast = useToast();
  const confirm = useConfirm();

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
    const ok = await confirm({
      message: 'Excluir este cronograma? Todas as aulas geradas serão removidas.',
      confirmLabel: 'Excluir', danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/schedules/${id}`);
      fetchConfigs();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      toast.error(detail || 'Erro ao excluir cronograma.');
    }
  };

  const institutions = useMemo(
    () => [...new Set(configs.map((c) => c.institution).filter((v): v is string => !!v))].sort(),
    [configs],
  );
  const courseNames = useMemo(
    () => [...new Set(configs.map((c) => c.course_name))].sort(),
    [configs],
  );
  const professors = useMemo(
    () => [...new Set(configs.map((c) => c.owner_name).filter((v): v is string => !!v))].sort(),
    [configs],
  );

  const filteredConfigs = useMemo(() => configs.filter((c) => (
    (institutionFilter === ALL || c.institution === institutionFilter) &&
    (formatFilter === ALL || c.format === formatFilter) &&
    (courseFilter === ALL || c.course_name === courseFilter) &&
    (levelFilter === ALL || c.academic_level === levelFilter) &&
    (professorFilter === ALL || c.owner_name === professorFilter)
  )), [configs, institutionFilter, formatFilter, courseFilter, levelFilter, professorFilter]);

  const hasActiveFilters = [institutionFilter, formatFilter, courseFilter, levelFilter, professorFilter].some((f) => f !== ALL);
  const clearFilters = () => {
    setInstitutionFilter(ALL); setFormatFilter(ALL); setCourseFilter(ALL); setLevelFilter(ALL); setProfessorFilter(ALL);
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

      {configs.length > 0 && (
        <div className="card p-4 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted uppercase tracking-wide"><Filter size={14} /> Filtros</span>
          <select value={institutionFilter} onChange={(e) => setInstitutionFilter(e.target.value)} className="select-custom w-auto">
            <option value={ALL}>Instituição: todas</option>
            {institutions.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="select-custom w-auto">
            <option value={ALL}>Modalidade: todas</option>
            <option value="presencial">Presencial</option>
            <option value="remoto">Remoto</option>
          </select>
          <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="select-custom w-auto">
            <option value={ALL}>Curso: todos</option>
            {courseNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="select-custom w-auto">
            <option value={ALL}>Nível: todos</option>
            {ACADEMIC_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          {user?.role === 'admin' && professors.length > 0 && (
            <select value={professorFilter} onChange={(e) => setProfessorFilter(e.target.value)} className="select-custom w-auto">
              <option value={ALL}>Professor: todos</option>
              {professors.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-accent hover:underline ml-auto">Limpar filtros</button>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-muted">Carregando cronogramas...</div>
      ) : configs.length === 0 ? (
        <div className="card border-dashed py-16 text-center">
          <CalendarDays size={40} className="mx-auto text-faint mb-3" />
          <p className="text-muted">Nenhum cronograma gerado ainda.</p>
        </div>
      ) : filteredConfigs.length === 0 ? (
        <div className="card border-dashed py-16 text-center">
          <CalendarDays size={40} className="mx-auto text-faint mb-3" />
          <p className="text-muted">Nenhum cronograma corresponde aos filtros selecionados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredConfigs.map((c) => (
            <div key={c.id} className="card p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink truncate">{c.discipline_name}</h3>
                  <p className="text-xs text-muted mt-0.5 truncate">{c.course_name} · {c.module_name}</p>
                  {c.recurrence === 'na' && c.event_title && (
                    <p className="text-xs text-accent mt-0.5 truncate">{c.event_title}</p>
                  )}
                  {c.institution && (
                    <p className="text-xs text-faint mt-0.5 truncate flex items-center gap-1"><Building2 size={12} /> {c.institution}</p>
                  )}
                  {user?.role === 'admin' && c.owner_name && (
                    <p className="text-xs text-faint mt-0.5 truncate">Professor: {c.owner_name}</p>
                  )}
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
                <span>{levelLabel(c.academic_level)}</span>
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-line">
                <span className="text-xs text-muted">{c.num_classes ?? 0} aulas · {formatHours(c.workload)}</span>
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
