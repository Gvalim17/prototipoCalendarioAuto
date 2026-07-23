import { ReactNode, useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Calendar, BookOpen, CheckCircle2, AlertCircle, ArrowLeft, ChevronRight, Clock,
  CalendarDays, List as ListIcon, GraduationCap, Download, RefreshCw, XCircle, Star,
  Pencil, Trash2, Undo2,
} from 'lucide-react';
import api from '../api/client';
import {
  WEEKDAYS,
  type Course, type Discipline, type Holiday, type Module, type Recurrence, type HolidayPolicy,
  type ScheduleConfigRead, type ScheduleConflictCheckResponse, type ScheduleConflictItem,
} from '../types/domain';
import { useToast } from '../contexts/ToastContext';

interface FormData {
  course_id: number;
  module_id: number;
  discipline_id: number;
  format: 'presencial' | 'remoto';
  start_date: string;
  end_date: string;
  recurrence: Recurrence;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  holiday_policy: HolidayPolicy;
  event_title: string;
}

interface SkippedDate { date: string; reason: string; suggested_date?: string | null; }
interface HolidayWarning { date: string; adjacent_date: string; position: 'day_before' | 'day_after'; holiday_description: string; }
interface GenerateResponse { dates: string[]; skipped: SkippedDate[]; num_classes: number; total_workload: number; holiday_warnings?: HolidayWarning[]; }

const getErrorMessage = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ');
  if (error instanceof Error) return error.message;
  return 'Erro inesperado';
};

const classHours = (start: string, end: string): number => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
};

// Formata horas decimais (ex: carga horária = num_aulas * duração/aula, que
// raramente fecha em número redondo) como "1h40" em vez de "1.6666666h".
const formatHours = (hours: number): string => {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
};

const ScheduleForm = () => {
  const { configId } = useParams<{ configId?: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const isEditing = !!configId;

  const [loading, setLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(isEditing);
  const [step, setStep] = useState(1);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [result, setResult] = useState<GenerateResponse>({ dates: [], skipped: [], num_classes: 0, total_workload: 0 });
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [resolutions, setResolutions] = useState<Record<string, { action: 'auto' | 'manual'; resolved_date: string }>>({});
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [conflicts, setConflicts] = useState<ScheduleConflictCheckResponse | null>(null);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    course_id: 0,
    module_id: 0,
    discipline_id: 0,
    format: 'presencial',
    start_date: '',
    end_date: '',
    recurrence: 'semanal',
    days_of_week: [1],
    start_time: '19:00',
    end_time: '22:00',
    holiday_policy: 'reschedule',
    event_title: '',
  });

  useEffect(() => {
    api.get<Course[]>(`/courses/`).then((r) => setCourses(r.data)).catch(() => {});
    api.get<Holiday[]>(`/holidays/`).then((r) => setHolidays(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!configId) return;
    const loadForEdit = async () => {
      setLoadingConfig(true);
      try {
        const { data: cfg } = await api.get<ScheduleConfigRead>(`/schedules/${configId}`);
        const [modRes, discRes] = await Promise.all([
          api.get<Module[]>(`/courses/${cfg.course_id}/modules`),
          api.get<Discipline[]>(`/modules/${cfg.module_id}/disciplines`),
        ]);
        setModules(modRes.data);
        setDisciplines(discRes.data);
        setFormData({
          course_id: cfg.course_id,
          module_id: cfg.module_id,
          discipline_id: cfg.discipline_id,
          format: cfg.format === 'remoto' ? 'remoto' : 'presencial',
          start_date: cfg.start_date,
          end_date: cfg.end_date || '',
          recurrence: cfg.recurrence,
          days_of_week: cfg.days_of_week.length ? cfg.days_of_week : [1],
          start_time: cfg.start_time ? cfg.start_time.slice(0, 5) : '19:00',
          end_time: cfg.end_time ? cfg.end_time.slice(0, 5) : '22:00',
          holiday_policy: cfg.holiday_policy,
          event_title: cfg.event_title || '',
        });
      } catch (err) {
        toast.error('Erro ao carregar cronograma para edição: ' + getErrorMessage(err));
        navigate('/schedules');
      } finally {
        setLoadingConfig(false);
      }
    };
    loadForEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId]);

  const fetchModules = async (courseId: number) => {
    try {
      const res = await api.get<Module[]>(`/courses/${courseId}/modules`);
      setModules(res.data);
      setDisciplines([]);
      setFormData((p) => ({ ...p, module_id: 0, discipline_id: 0 }));
    } catch { /* ignore */ }
  };

  const fetchDisciplines = async (moduleId: number) => {
    try {
      const res = await api.get<Discipline[]>(`/modules/${moduleId}/disciplines`);
      setDisciplines(res.data);
      setFormData((p) => ({ ...p, discipline_id: 0 }));
    } catch { /* ignore */ }
  };

  const toggleDay = (day: number) => {
    setFormData((p) => ({
      ...p,
      days_of_week: p.days_of_week.includes(day) ? p.days_of_week.filter((d) => d !== day) : [...p.days_of_week, day].sort((a, b) => a - b),
    }));
  };

  const buildConfig = () => ({
    course_id: formData.course_id,
    module_id: formData.module_id,
    discipline_id: formData.discipline_id,
    format: formData.format,
    start_date: formData.start_date,
    end_date: formData.recurrence === 'na' ? null : formData.end_date,
    recurrence: formData.recurrence,
    days_of_week: formData.recurrence === 'na' ? [] : formData.days_of_week,
    start_time: formData.start_time,
    end_time: formData.end_time,
    holiday_policy: formData.holiday_policy,
    event_title: formData.recurrence === 'na' ? (formData.event_title.trim() || null) : null,
  });

  const validate = (): string | null => {
    if (!formData.discipline_id) return 'Selecione a disciplina.';
    if (!formData.start_date) return 'Informe a data de início.';
    if (formData.recurrence !== 'na') {
      if (!formData.end_date) return 'Informe a data de fim.';
      if (formData.end_date < formData.start_date) return 'A data de fim deve ser posterior à de início.';
      if (formData.days_of_week.length === 0) return 'Selecione ao menos um dia da semana.';
    }
    if (classHours(formData.start_time, formData.end_time) <= 0) return 'O horário de término deve ser posterior ao de início.';
    return null;
  };

  const handleGenerate = async () => {
    const error = validate();
    if (error) { toast.error(error); return; }
    setLoading(true);
    try {
      const res = await api.post<GenerateResponse>(`/generate-schedule/`, buildConfig());
      setResult(res.data);
      if (res.data.dates.length > 0) setCurrentMonth(new Date(res.data.dates[0] + 'T00:00:00'));

      if (formData.holiday_policy !== 'skip' && res.data.skipped.length > 0) {
        const initial: Record<string, { action: 'auto' | 'manual'; resolved_date: string }> = {};
        if (formData.holiday_policy === 'reschedule') {
          // Automático: pré-aceita a sugestão do sistema para cada conflito
          for (const s of res.data.skipped) if (s.suggested_date) initial[s.date] = { action: 'auto', resolved_date: s.suggested_date };
        }
        // Manual: nada é pré-preenchido — o professor escolhe cada data
        setResolutions(initial);
        setStep(2);
      } else {
        setStep(3);
      }
    } catch (err) {
      toast.error('Erro ao gerar: ' + getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const canApplyResolutions = result.skipped.every((s) => !!resolutions[s.date]?.resolved_date);

  const handleApplyResolutions = async () => {
    if (!canApplyResolutions) { toast.error('Escolha uma data de reposição para todas as aulas em conflito.'); return; }
    setLoading(true);
    try {
      const resolutionList = result.skipped.map((s) => {
        const r = resolutions[s.date];
        return { original_date: s.date, action: r?.action ?? 'manual', resolved_date: r?.resolved_date ?? s.date };
      });
      const res = await api.post<GenerateResponse>(`/schedules/resolve-conflicts/`, { config: buildConfig(), resolutions: resolutionList });
      setResult({ dates: res.data.dates, skipped: [], num_classes: res.data.num_classes, total_workload: res.data.total_workload });
      if (res.data.dates.length > 0) setCurrentMonth(new Date(res.data.dates[0] + 'T00:00:00'));
      setStep(3);
    } catch (err) {
      toast.error('Erro ao aplicar resoluções: ' + getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReviewClick = async () => {
    setCheckingConflicts(true);
    try {
      const res = await api.post<ScheduleConflictCheckResponse>('/schedules/check-conflicts', {
        dates: result.dates,
        start_time: formData.start_time,
        end_time: formData.end_time,
        exclude_config_id: isEditing && configId ? Number(configId) : null,
      });
      if (res.data.overlaps.length > 0 || res.data.near.length > 0) {
        setConflicts(res.data);
      } else {
        setShowSaveConfirm(true);
      }
    } catch {
      // Checagem de conflito é só um aviso — se falhar, não trava o fluxo de salvar.
      setShowSaveConfirm(true);
    } finally {
      setCheckingConflicts(false);
    }
  };

  const handleFinalSave = async (finalDates: string[]) => {
    if (finalDates.length === 0) { toast.error('O cronograma precisa ter pelo menos uma aula.'); return; }
    setLoading(true);
    try {
      const sortedDates = [...finalDates].sort();
      const payload = {
        config: buildConfig(),
        classes: sortedDates.map((d, i) => ({ date: d, order: i + 1 })),
      };
      if (isEditing) {
        await api.put(`/schedules/${configId}`, payload);
        toast.success('Cronograma regenerado com sucesso!');
      } else {
        await api.post(`/schedules/`, payload);
        toast.success('Cronograma salvo com sucesso!');
      }
      setShowSaveConfirm(false);
      navigate('/schedules');
    } catch (err) {
      toast.error('Erro ao salvar cronograma: ' + getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleExportPreview = async () => {
    try {
      const course = courses.find((c) => c.id === formData.course_id);
      const res = await api.post(`/schedules/export-preview/xlsx`, {
        course_name: course?.name || 'Curso',
        module_name: modules.find((m) => m.id === formData.module_id)?.name || 'Módulo',
        discipline_name: disciplines.find((d) => d.id === formData.discipline_id)?.name || 'Disciplina',
        format: formData.format,
        dates: result.dates,
        recurrence: formData.recurrence,
        institution: course?.institution ?? null,
        academic_level: course?.academic_level ?? null,
        semester: course?.semester ?? null,
        start_time: formData.start_time,
        end_time: formData.end_time,
        workload: result.total_workload,
      }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'cronograma_preview.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao exportar cronograma.');
    }
  };

  const perClass = classHours(formData.start_time, formData.end_time);

  if (loadingConfig) {
    return <div className="flex items-center justify-center h-96 text-muted animate-pulse">Carregando cronograma...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted hover:text-ink transition-colors w-fit text-sm">
        <ArrowLeft size={18} /> Voltar
      </button>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink tracking-tight">{isEditing ? 'Editar cronograma' : 'Gerar cronograma'}</h2>
          <p className="text-muted mt-1 text-sm">
            {isEditing ? 'Ajuste os parâmetros e regenere as datas do cronograma.' : 'Defina a disciplina, o período e a recorrência das aulas.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold ${step === n ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted border border-line'}`}>{n}</div>
          ))}
        </div>
      </div>

      {isEditing && (
        <div className="card p-4 flex items-center justify-between gap-3 bg-accent/5 border-accent/20">
          <p className="text-sm text-muted">
            Este formulário recalcula <strong className="text-ink">todas</strong> as aulas do cronograma. Para alterar
            ou cancelar só uma aula específica, sem mexer nas demais, use a edição individual.
          </p>
          <Link to={`/schedules/${configId}/plan`} className="btn-ghost shrink-0 whitespace-nowrap">
            Editar aulas individualmente
          </Link>
        </div>
      )}

      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <section className="card p-6 space-y-4">
              <h3 className="text-base font-semibold text-ink flex items-center gap-2"><BookOpen size={18} className="text-accent" /> Estrutura acadêmica</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Curso" icon={<GraduationCap size={13} />}>
                  <select className="select-custom" value={formData.course_id}
                    onChange={(e) => { const v = parseInt(e.target.value); setFormData({ ...formData, course_id: v }); if (v) fetchModules(v); }}>
                    <option value={0}>Selecione o curso</option>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.institution ? ` — ${c.institution}` : ''}</option>)}
                  </select>
                </Field>
                <Field label="Módulo" icon={<BookOpen size={13} />}>
                  <select disabled={!formData.course_id} className="select-custom" value={formData.module_id}
                    onChange={(e) => { const v = parseInt(e.target.value); setFormData({ ...formData, module_id: v }); if (v) fetchDisciplines(v); }}>
                    <option value={0}>Selecione o módulo</option>
                    {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="Disciplina" icon={<CheckCircle2 size={13} />}>
                  <select disabled={!formData.module_id} className="select-custom" value={formData.discipline_id}
                    onChange={(e) => setFormData({ ...formData, discipline_id: parseInt(e.target.value) })}>
                    <option value={0}>Selecione a disciplina</option>
                    {disciplines.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Formato" icon={<Calendar size={13} />}>
                  <select className="select-custom" value={formData.format}
                    onChange={(e) => setFormData({ ...formData, format: e.target.value as 'presencial' | 'remoto' })}>
                    <option value="presencial">Presencial</option>
                    <option value="remoto">Remoto / Online</option>
                  </select>
                </Field>
              </div>
            </section>

            <section className="card p-6 space-y-4">
              <h3 className="text-base font-semibold text-ink flex items-center gap-2"><CalendarDays size={18} className="text-accent" /> Período e recorrência</h3>

              <Field label="Recorrência" icon={<ListIcon size={13} />}>
                <select className="select-custom" value={formData.recurrence}
                  onChange={(e) => setFormData({ ...formData, recurrence: e.target.value as Recurrence })}>
                  <option value="semanal">Semanal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="na">Evento único</option>
                </select>
              </Field>

              {formData.recurrence === 'na' && (
                <Field label="Do que se trata este evento?">
                  <input
                    type="text" className="input-custom" maxLength={200}
                    placeholder="Ex: Palestra sobre Ética em IA, Banca de TCC, Aula magna..."
                    value={formData.event_title} onChange={(e) => setFormData({ ...formData, event_title: e.target.value })}
                  />
                </Field>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Data de início" icon={<Calendar size={13} />}>
                  <input type="date" className="input-custom" value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
                </Field>
                {formData.recurrence !== 'na' && (
                  <Field label="Data de fim" icon={<Calendar size={13} />}>
                    <input type="date" className="input-custom" value={formData.end_date} min={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
                  </Field>
                )}
              </div>

              {formData.recurrence !== 'na' && (
                <Field label="Dias da semana">
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((d) => {
                      const active = formData.days_of_week.includes(d.value);
                      return (
                        <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                          className={`px-3 h-10 rounded-lg text-sm font-medium border transition-colors ${active ? 'bg-accent text-accent-fg border-accent' : 'bg-surface-2 text-muted border-line hover:text-ink'}`}>
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Horário de início" icon={<Clock size={13} />}>
                  <input type="time" className="input-custom" value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} />
                </Field>
                <Field label="Horário de término" icon={<Clock size={13} />}>
                  <input type="time" className="input-custom" value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })} />
                </Field>
              </div>

              <Field label="Ao coincidir com feriado ou recesso">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <PolicyOption
                    active={formData.holiday_policy === 'reschedule'}
                    onClick={() => setFormData({ ...formData, holiday_policy: 'reschedule' })}
                    icon={<RefreshCw size={16} />}
                    title="Remarcar automaticamente"
                    desc="O sistema sugere a reposição"
                  />
                  <PolicyOption
                    active={formData.holiday_policy === 'manual'}
                    onClick={() => setFormData({ ...formData, holiday_policy: 'manual' })}
                    icon={<CalendarDays size={16} />}
                    title="Remarcar manualmente"
                    desc="Você escolhe a data de reposição"
                  />
                  <PolicyOption
                    active={formData.holiday_policy === 'skip'}
                    onClick={() => setFormData({ ...formData, holiday_policy: 'skip' })}
                    icon={<XCircle size={16} />}
                    title="Não remarcar"
                    desc="Perde o dia; recalcula o total"
                  />
                </div>
              </Field>
            </section>
          </div>

          <div className="space-y-4">
            <div className="card p-5 space-y-3">
              <h4 className="font-medium text-ink text-sm">Resumo da configuração</h4>
              <SummaryRow label="Recorrência" value={formData.recurrence === 'na' ? 'Evento único' : formData.recurrence} />
              {formData.recurrence !== 'na' && (
                <SummaryRow label="Dias" value={formData.days_of_week.map((d) => WEEKDAYS[d].short).join(', ') || '—'} />
              )}
              <SummaryRow label="Duração/aula" value={perClass > 0 ? formatHours(perClass) : '—'} />
              <SummaryRow label="Política" value={
                formData.holiday_policy === 'skip' ? 'Não remarcar' :
                formData.holiday_policy === 'manual' ? 'Remarcar manualmente' : 'Remarcar automaticamente'
              } />
              <p className="text-xs text-muted pt-2 border-t border-line">
                A quantidade de aulas e a carga horária total são calculadas a partir do período informado.
              </p>
            </div>

            <button onClick={handleGenerate} disabled={loading} className="btn-primary w-full h-14 text-base">
              {loading ? 'Calculando...' : isEditing ? 'Recalcular cronograma' : 'Calcular cronograma'}<ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setStep(1)} className="btn-ghost h-10 w-10 p-0"><ArrowLeft size={18} /></button>
            <div>
              <h3 className="text-xl font-semibold text-ink">Resolução de conflitos</h3>
              <p className="text-muted text-sm">
                {formData.holiday_policy === 'manual'
                  ? 'Escolha manualmente a data de reposição para cada aula.'
                  : 'Confira as reposições sugeridas ou ajuste manualmente.'}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {result.skipped.map((s) => {
              const r = resolutions[s.date];
              return (
                <div key={s.date} className="card p-4 border-warn/30 space-y-3">
                  <div>
                    <p className="text-ink font-medium capitalize">
                      {new Date(s.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-warn text-sm flex items-center gap-1 mt-0.5"><AlertCircle size={14} /> {s.reason}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" disabled={!s.suggested_date}
                      onClick={() => s.suggested_date && setResolutions((p) => ({ ...p, [s.date]: { action: 'auto', resolved_date: s.suggested_date! } }))}
                      className={`p-3 rounded-lg border text-sm font-medium text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${r?.action === 'auto' ? 'bg-ok/10 border-ok/40 text-ok' : 'bg-surface-2 border-line text-muted hover:text-ink'}`}>
                      <CheckCircle2 size={15} className="mb-1" /> Reposição automática
                      {s.suggested_date ? (
                        <p className="text-xs mt-1 opacity-80">→ {new Date(s.suggested_date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                      ) : (
                        <p className="text-xs mt-1 opacity-80">Sem sugestão disponível</p>
                      )}
                    </button>
                    <div className={`p-3 rounded-lg border text-sm font-medium transition-colors ${r?.action === 'manual' ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-surface-2 border-line text-muted'}`}>
                      <CalendarDays size={15} className="mb-1" /> Data manual
                      <input type="date" className="mt-2 w-full bg-surface border border-line rounded px-2 py-1 text-xs text-ink"
                        value={r?.action === 'manual' ? r.resolved_date : ''}
                        onChange={(e) => e.target.value && setResolutions((p) => ({ ...p, [s.date]: { action: 'manual', resolved_date: e.target.value } }))} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button onClick={handleApplyResolutions} disabled={loading || !canApplyResolutions} className="btn-primary w-full h-12">
            {loading ? 'Processando...' : 'Aplicar e ver cronograma'}<ChevronRight size={18} />
          </button>
          {!canApplyResolutions && (
            <p className="text-xs text-warn text-center -mt-2">Escolha uma data de reposição para todas as aulas em conflito.</p>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-ink">Cronograma gerado</h3>
              <p className="text-muted text-sm">Revise as datas antes de salvar.</p>
            </div>
            <div className="flex gap-2">
              <div className="flex bg-surface-2 p-1 border border-line rounded-xl">
                {(['calendar', 'list'] as const).map((m) => (
                  <button key={m} onClick={() => setViewMode(m)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${viewMode === m ? 'bg-accent text-accent-fg' : 'text-muted hover:text-ink'}`}>
                    {m === 'list' ? <ListIcon size={15} /> : <CalendarDays size={15} />}
                  </button>
                ))}
              </div>
              <button onClick={handleExportPreview} className="btn-ghost"><Download size={16} /> .xlsx</button>
              <button onClick={() => setStep(1)} className="btn-ghost"><ArrowLeft size={16} /> Ajustar</button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {viewMode === 'list' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.dates.map((dateStr, idx) => (
                    <div key={idx} className="card p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-accent/10 flex flex-col items-center justify-center text-accent shrink-0">
                        <span className="text-[9px] uppercase opacity-70">Aula</span>
                        <span className="font-semibold">{idx + 1}</span>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-muted tracking-wide">{formData.recurrence === 'na' ? (formData.event_title.trim() || 'Evento único') : 'Encontro'}</p>
                        <h4 className="text-ink font-medium capitalize">
                          {new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' })}
                        </h4>
                        <p className="text-xs text-muted">{formData.start_time} – {formData.end_time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <PreviewCalendar
                  currentMonth={currentMonth}
                  dates={result.dates}
                  holidays={holidays}
                  isNa={formData.recurrence === 'na'}
                  eventTitle={formData.event_title}
                  onPrev={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                  onNext={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                />
              )}
            </div>

            <div className="space-y-4">
              {result.skipped.length > 0 && (
                <div className="card p-5">
                  <h4 className="font-medium text-ink text-sm mb-3 flex items-center gap-2">
                    <AlertCircle size={16} className="text-warn" /> {formData.holiday_policy === 'skip' ? 'Aulas perdidas' : 'Conflitos'}
                  </h4>
                  <div className="space-y-2">
                    {result.skipped.map((s, i) => (
                      <div key={i} className="p-3 rounded-lg bg-surface-2 border border-line">
                        <p className="text-sm font-medium text-warn">{new Date(s.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p>
                        <p className="text-xs text-muted">{s.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(result.holiday_warnings?.length ?? 0) > 0 && (
                <div className="card p-5">
                  <h4 className="font-medium text-ink text-sm mb-3 flex items-center gap-2">
                    <AlertCircle size={16} className="text-warn" /> Atenção: feriado próximo
                  </h4>
                  <div className="space-y-2">
                    {result.holiday_warnings!.map((w, i) => (
                      <div key={i} className="p-3 rounded-lg bg-surface-2 border border-line">
                        <p className="text-sm font-medium text-warn">
                          {new Date(w.date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' })}
                        </p>
                        <p className="text-xs text-muted">
                          {w.position === 'day_before' ? 'Véspera' : 'Dia seguinte'} de {w.holiday_description} ({new Date(w.adjacent_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}) — pode haver mais faltas, considere remarcar essa aula individualmente se preferir.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card p-5">
                <p className="text-xs uppercase text-muted tracking-wide">Resumo</p>
                <div className="space-y-2 my-4">
                  <SummaryRow label="Total de aulas" value={`${result.dates.length}`} strong />
                  <SummaryRow label="Carga horária total" value={formatHours(result.total_workload)} strong />
                  {formData.holiday_policy === 'skip' && result.skipped.length > 0 && (
                    <SummaryRow label="Aulas perdidas" value={`${result.skipped.length}`} />
                  )}
                </div>
                <button onClick={handleReviewClick} disabled={loading || checkingConflicts || result.dates.length === 0} className="btn-primary w-full h-12">
                  {checkingConflicts ? 'Verificando conflitos...' : 'Revisar e confirmar'}<CheckCircle2 size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {conflicts && (
        <ScheduleConflictModal
          conflicts={conflicts}
          onCancel={() => setConflicts(null)}
          onConfirm={() => { setConflicts(null); setShowSaveConfirm(true); }}
        />
      )}

      {showSaveConfirm && (
        <SaveConfirmModal
          courseName={courses.find((c) => c.id === formData.course_id)?.name}
          disciplineName={disciplines.find((d) => d.id === formData.discipline_id)?.name}
          format={formData.format}
          dates={result.dates}
          startTime={formData.start_time}
          endTime={formData.end_time}
          totalWorkload={result.total_workload}
          classHours={classHours(formData.start_time, formData.end_time)}
          loading={loading}
          isEditing={isEditing}
          onCancel={() => setShowSaveConfirm(false)}
          onConfirm={handleFinalSave}
        />
      )}
    </div>
  );
};

const Field = ({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-muted flex items-center gap-1.5">{icon}{label}</label>
    {children}
  </div>
);

const SummaryRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex justify-between items-center text-sm">
    <span className="text-muted">{label}</span>
    <span className={strong ? 'text-ink font-semibold' : 'text-ink'}>{value}</span>
  </div>
);

const PolicyOption = ({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; desc: string }) => (
  <button type="button" onClick={onClick}
    className={`p-3 rounded-lg border text-left transition-colors ${active ? 'bg-accent/10 border-accent/40' : 'bg-surface-2 border-line hover:border-muted/40'}`}>
    <div className={`flex items-center gap-2 font-medium text-sm ${active ? 'text-accent' : 'text-ink'}`}>{icon}{title}</div>
    <p className="text-xs text-muted mt-1">{desc}</p>
  </button>
);

interface PreviewCalendarProps {
  currentMonth: Date;
  dates: string[];
  holidays: Holiday[];
  isNa: boolean;
  eventTitle?: string;
  onPrev: () => void;
  onNext: () => void;
}

const PreviewCalendar = ({ currentMonth, dates, holidays, isNa, eventTitle, onPrev, onNext }: PreviewCalendarProps) => {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  return (
    <div className="card overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-line bg-surface-2">
        <h3 className="font-semibold text-ink capitalize">{currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
        <div className="flex gap-2">
          <button onClick={onPrev} className="w-8 h-8 rounded-lg border border-line bg-surface text-muted hover:text-ink flex items-center justify-center"><ArrowLeft size={16} /></button>
          <button onClick={onNext} className="w-8 h-8 rounded-lg border border-line bg-surface text-muted hover:text-ink flex items-center justify-center"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-line">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
          <div key={d} className="py-3 text-center text-xs font-medium text-muted">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="min-h-[7rem] border-r border-b border-line" />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const classIndex = dates.indexOf(dateStr);
          const isClass = classIndex !== -1;
          const holiday = holidays.find((h) => h.date === dateStr);
          return (
            <div key={d} className="min-h-[7rem] border-r border-b border-line p-2 flex flex-col">
              <span className={`text-sm font-medium ${holiday ? 'text-danger' : 'text-muted'}`}>{d}</span>
              {isClass && (
                <div className="mt-1.5 bg-accent text-accent-fg rounded-md p-2 flex-1 flex flex-col justify-center items-center text-center gap-0.5">
                  {isNa ? <Star size={16} /> : <CheckCircle2 size={16} />}
                  <span className="text-sm font-bold leading-tight">{isNa ? (eventTitle?.trim() || 'Evento único') : `Aula ${classIndex + 1}`}</span>
                </div>
              )}
              {holiday && !isClass && (
                <div className="mt-1.5 bg-danger/10 border border-danger/20 text-danger text-[11px] font-medium py-1.5 px-2 rounded-md leading-snug" title={holiday.description}>
                  {holiday.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const formatConflictDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' });

const ConflictItemRow = ({ item }: { item: ScheduleConflictItem }) => (
  <div className="flex items-center justify-between px-3 py-2 text-sm">
    <div className="min-w-0">
      <p className="text-ink truncate">{item.discipline_name} · {item.course_name}</p>
      <p className="text-xs text-muted capitalize">{formatConflictDate(item.date)}</p>
    </div>
    <span className="text-xs text-muted shrink-0">{item.start_time?.slice(0, 5)} – {item.end_time?.slice(0, 5)}</span>
  </div>
);

interface ScheduleConflictModalProps {
  conflicts: ScheduleConflictCheckResponse;
  onCancel: () => void;
  onConfirm: () => void;
}

const ScheduleConflictModal = ({ conflicts, onCancel, onConfirm }: ScheduleConflictModalProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
    <div className="card w-full max-w-lg p-6 shadow-2xl max-h-[85vh] flex flex-col">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-warn/10 text-warn flex items-center justify-center shrink-0"><AlertCircle size={20} /></div>
        <div>
          <h3 className="text-lg font-semibold text-ink">Possível conflito de horário</h3>
          <p className="text-sm text-muted mt-0.5">Você já tem outra(s) aula(s) marcada(s) nesse mesmo dia e horário. Confira e decida se quer continuar mesmo assim.</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
        {conflicts.overlaps.length > 0 && (
          <div>
            <p className="text-xs font-medium text-danger uppercase tracking-wide mb-2">Sobreposição de horário</p>
            <div className="border border-line rounded-lg divide-y divide-line">
              {conflicts.overlaps.map((item, i) => <ConflictItemRow key={i} item={item} />)}
            </div>
          </div>
        )}
        {conflicts.near.length > 0 && (
          <div>
            <p className="text-xs font-medium text-warn uppercase tracking-wide mb-2">Horário muito próximo (menos de 30 min de intervalo)</p>
            <div className="border border-line rounded-lg divide-y divide-line">
              {conflicts.near.map((item, i) => <ConflictItemRow key={i} item={item} />)}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-5">
        <button onClick={onCancel} className="btn-ghost flex-1 h-11">Voltar e ajustar</button>
        <button onClick={onConfirm} className="btn-primary flex-1 h-11">Continuar mesmo assim</button>
      </div>
    </div>
  </div>
);

interface SaveConfirmModalProps {
  courseName?: string;
  disciplineName?: string;
  format: string;
  dates: string[];
  startTime: string;
  endTime: string;
  totalWorkload: number;
  classHours: number;
  loading: boolean;
  isEditing: boolean;
  onCancel: () => void;
  onConfirm: (finalDates: string[]) => void;
}

interface ConfirmRow {
  key: number;
  date: string;
  included: boolean;
}

const formatConfirmDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });

const SaveConfirmModal = ({ courseName, disciplineName, format, dates, startTime, endTime, totalWorkload, classHours, loading, isEditing, onCancel, onConfirm }: SaveConfirmModalProps) => {
  const [rows, setRows] = useState<ConfirmRow[]>(() => dates.map((date, key) => ({ key, date, included: true })));
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const includedCount = rows.filter((r) => r.included).length;
  const workload = Math.round(includedCount * classHours * 100) / 100;

  const toggleIncluded = (key: number) => setRows((prev) => prev.map((r) => r.key === key ? { ...r, included: !r.included } : r));
  const startEditing = (row: ConfirmRow) => { setEditingKey(row.key); setEditingValue(row.date); };
  const confirmEdit = (key: number) => {
    setRows((prev) => prev.map((r) => r.key === key ? { ...r, date: editingValue } : r));
    setEditingKey(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
      <div className="card w-full max-w-lg p-6 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0"><CheckCircle2 size={20} /></div>
          <div>
            <h3 className="text-lg font-semibold text-ink">{isEditing ? 'Confirmar regeneração' : 'Confirmar cronograma'}</h3>
            <p className="text-sm text-muted mt-0.5">
              {isEditing
                ? 'As aulas atuais deste cronograma serão substituídas pelas novas datas abaixo.'
                : 'Revise como as aulas ficarão antes de salvar. Você pode desmarcar ou remarcar uma aula específica antes de confirmar.'}
            </p>
          </div>
        </div>

        <div className="space-y-1 mb-4 text-sm">
          <SummaryRow label="Disciplina" value={disciplineName || '—'} strong />
          <SummaryRow label="Curso" value={courseName || '—'} />
          <SummaryRow label="Formato" value={format === 'presencial' ? 'Presencial' : 'Remoto / Online'} />
          <SummaryRow label="Horário" value={`${startTime} – ${endTime}`} />
          <SummaryRow label="Total de aulas" value={`${includedCount}${includedCount !== dates.length ? ` de ${dates.length}` : ''}`} strong />
          <SummaryRow label="Carga horária total" value={formatHours(includedCount === dates.length ? totalWorkload : workload)} strong />
        </div>

        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Datas confirmadas</p>
        <div className="flex-1 overflow-y-auto custom-scrollbar border border-line rounded-lg divide-y divide-line">
          {rows.map((row, i) => (
            <div key={row.key} className={`flex items-center gap-2 px-3 py-2 text-sm ${!row.included ? 'opacity-50' : ''}`}>
              <span className="text-muted shrink-0 w-14">Aula {i + 1}</span>
              {editingKey === row.key ? (
                <span className="flex-1 flex items-center gap-2">
                  <input
                    type="date" value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
                    className="input-custom h-8 py-0 text-sm w-auto"
                  />
                  <button onClick={() => confirmEdit(row.key)} className="text-xs text-accent font-medium hover:underline">Confirmar</button>
                  <button onClick={() => setEditingKey(null)} className="text-xs text-muted hover:underline">Cancelar</button>
                </span>
              ) : (
                <>
                  <span className={`flex-1 text-ink capitalize ${!row.included ? 'line-through' : ''}`}>{formatConfirmDate(row.date)}</span>
                  {row.included && (
                    <button onClick={() => startEditing(row)} title="Remarcar esta aula" className="p-1.5 text-muted hover:text-accent transition-colors shrink-0">
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => toggleIncluded(row.key)}
                    title={row.included ? 'Desmarcar esta aula' : 'Remarcar (incluir de novo)'}
                    className={`p-1.5 transition-colors shrink-0 ${row.included ? 'text-muted hover:text-danger' : 'text-accent hover:text-accent'}`}
                  >
                    {row.included ? <Trash2 size={14} /> : <Undo2 size={14} />}
                  </button>
                </>
              )}
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-muted p-3">Nenhuma aula gerada.</p>}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} disabled={loading} className="btn-ghost flex-1 h-11">Voltar e ajustar</button>
          <button
            onClick={() => onConfirm(rows.filter((r) => r.included).map((r) => r.date))}
            disabled={loading || includedCount === 0} className="btn-primary flex-1 h-11"
          >
            {loading ? 'Salvando...' : isEditing ? 'Confirmar e regenerar' : 'Confirmar e salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleForm;
