import { ReactNode, useState, useEffect } from 'react';
import { GraduationCap, BookOpen, CalendarClock, CalendarCheck, ChevronRight, Download, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { levelLabel, type CalendarEvent, type Course, type Holiday, type Stats } from '../types/domain';
import { useToast } from '../contexts/ToastContext';

const Dashboard = () => {
  const toast = useToast();
  const [stats, setStats] = useState<Stats>({ courses: 0, modules: 0, disciplines: 0, scheduled_classes: 0 });
  const [nextHolidays, setNextHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'calendar'>('overview');
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [allSchedules, setAllSchedules] = useState<CalendarEvent[]>([]);
  const [allHolidays, setAllHolidays] = useState<Holiday[]>([]);
  const [nextClasses, setNextClasses] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [coursesRes, holidaysRes, schedulesRes, statsRes] = await Promise.all([
        api.get<Course[]>(`/courses/`),
        api.get<Holiday[]>(`/holidays/`),
        api.get<CalendarEvent[]>(`/schedules/`),
        api.get<Stats>(`/stats/`),
      ]);

      setAllCourses(coursesRes.data);
      setAllSchedules(schedulesRes.data);
      setAllHolidays(holidaysRes.data);
      setStats(statsRes.data);

      const today = new Date().toISOString().split('T')[0];
      setNextHolidays(holidaysRes.data.filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4));
      setNextClasses(schedulesRes.data.filter((s) => s.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5));
    } catch (err) {
      console.error('Erro ao carregar painel', err);
    } finally {
      setLoading(false);
    }
  };

  const exportXlsx = async () => {
    try {
      const res = await api.get(`/schedules/export/xlsx`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'cronograma.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao exportar cronograma.');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-96 text-muted animate-pulse">Carregando painel...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink tracking-tight">Painel</h2>
          <p className="text-muted mt-1 text-sm">Visão geral dos cursos e cronogramas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex bg-surface-2 p-1 border border-line rounded-xl">
            {(['overview', 'calendar'] as const).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === t ? 'bg-accent text-accent-fg' : 'text-muted hover:text-ink'}`}>
                {t === 'overview' ? 'Resumo' : 'Calendário'}
              </button>
            ))}
          </div>
          <button onClick={exportXlsx} className="btn-ghost"><Download size={16} /> Exportar</button>
          <Link to="/generate" data-tour="dashboard-new-schedule" className="btn-primary"><CalendarCheck size={16} /> Novo cronograma</Link>
        </div>
      </div>

      {/* Contadores */}
      <div data-tour="dashboard-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<CalendarCheck size={20} />} label="Aulas agendadas" value={stats.scheduled_classes} highlight />
        <StatCard icon={<GraduationCap size={20} />} label="Cursos" value={stats.courses} to="/courses" />
        <StatCard icon={<Layers size={20} />} label="Módulos" value={stats.modules} to="/courses" />
        <StatCard icon={<BookOpen size={20} />} label="Disciplinas" value={stats.disciplines} to="/courses" />
      </div>

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-semibold text-ink">Cursos cadastrados</h3>
              <Link to="/courses" className="text-sm text-accent hover:underline flex items-center gap-1">Ver todos <ChevronRight size={14} /></Link>
            </div>
            <div className="space-y-3">
              {allCourses.length > 0 ? allCourses.map((course) => {
                const totalDisc = course.modules.reduce((a, m) => a + m.disciplines.length, 0);
                return (
                  <Link key={course.id} to={`/courses/${course.id}`}
                    className="flex items-center justify-between p-4 rounded-xl bg-surface-2 border border-line hover:border-accent/40 transition-colors group">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-11 h-11 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0"><GraduationCap size={22} /></div>
                      <div className="min-w-0">
                        <h4 className="font-medium text-ink truncate">{course.name}</h4>
                        <p className="text-xs text-muted mt-0.5">
                          {levelLabel(course.academic_level, course.academic_level_other)} · {course.year}{course.semester ? `/${course.semester}` : ''} · {course.modules.length} módulos · {totalDisc} disciplinas
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-muted group-hover:text-accent transition-colors shrink-0" />
                  </Link>
                );
              }) : (
                <div className="py-12 text-center">
                  <GraduationCap size={36} className="mx-auto text-faint mb-3" />
                  <p className="text-muted text-sm">Nenhum curso cadastrado.</p>
                  <Link to="/courses" className="text-accent text-sm hover:underline mt-2 inline-block">Cadastrar curso</Link>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
                <CalendarClock size={16} className="text-accent" /> Feriados próximos
              </h3>
              <div className="space-y-2">
                {nextHolidays.length > 0 ? nextHolidays.map((h) => (
                  <Link key={h.id} to="/holidays" className="flex items-center gap-3 p-3 rounded-lg bg-surface-2 border border-line hover:border-accent/30 transition-colors">
                    <DateBadge date={h.date} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{h.description}</p>
                      <span className="text-xs text-muted capitalize">{h.type}</span>
                    </div>
                  </Link>
                )) : <p className="text-sm text-muted italic">Nenhum feriado próximo.</p>}
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
                <CalendarCheck size={16} className="text-accent" /> Próximas aulas
              </h3>
              <div className="space-y-2">
                {nextClasses.length > 0 ? nextClasses.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-2 border border-line">
                    <DateBadge date={s.date} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">{s.discipline_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="truncate">{s.course_name}</span>
                        {s.start_time && <span>· {String(s.start_time).slice(0, 5)}</span>}
                      </div>
                    </div>
                  </div>
                )) : <p className="text-sm text-muted italic">Nenhuma aula agendada.</p>}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <CalendarView
          currentMonth={currentMonth}
          onNext={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
          onPrev={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
          schedules={allSchedules}
          holidays={allHolidays}
        />
      )}
    </div>
  );
};

const DateBadge = ({ date }: { date: string }) => {
  const d = new Date(date + 'T00:00:00');
  return (
    <div className="w-11 h-11 rounded-lg bg-surface border border-line flex flex-col items-center justify-center text-ink shrink-0">
      <span className="text-[9px] uppercase text-muted leading-none">{d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
      <span className="text-base font-semibold leading-tight">{d.getDate()}</span>
    </div>
  );
};

interface StatCardProps { icon: ReactNode; label: string; value: number | string; to?: string; highlight?: boolean; }

const StatCard = ({ icon, label, value, to, highlight }: StatCardProps) => {
  const content = (
    <>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${highlight ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-accent border border-line'}`}>{icon}</div>
      <p className="text-3xl font-semibold text-ink tracking-tight">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </>
  );
  const cls = `card p-5 ${to ? 'hover:border-accent/40 transition-colors' : ''}`;
  return to ? <Link to={to} className={cls}>{content}</Link> : <div className={cls}>{content}</div>;
};

interface CalendarViewProps {
  currentMonth: Date;
  onNext: () => void;
  onPrev: () => void;
  schedules: CalendarEvent[];
  holidays: Holiday[];
}

const CalendarView = ({ currentMonth, onNext, onPrev, schedules, holidays }: CalendarViewProps) => {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-ink capitalize">{monthName}</h3>
        <div className="flex gap-2">
          <button onClick={onPrev} className="w-9 h-9 rounded-lg border border-line bg-surface-2 text-muted hover:text-ink flex items-center justify-center"><ChevronRight className="rotate-180" size={18} /></button>
          <button onClick={onNext} className="w-9 h-9 rounded-lg border border-line bg-surface-2 text-muted hover:text-ink flex items-center justify-center"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {dayNames.map((d) => <div key={d} className="text-center py-2 text-xs font-medium text-muted">{d}</div>)}
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} className="min-h-[9rem] rounded-lg bg-surface-2/40 border border-dashed border-line" />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayEvents = schedules.filter((s) => s.date.split('T')[0] === dateStr);
          const dayHoliday = holidays.find((h) => h.date.split('T')[0] === dateStr);
          const isToday = new Date().toISOString().split('T')[0] === dateStr;

          return (
            <div key={day} className={`min-h-[9rem] rounded-lg border p-2 flex flex-col ${dayHoliday ? 'bg-danger/5 border-danger/30' : isToday ? 'border-accent bg-accent/5' : 'bg-surface-2/40 border-line'}`}>
              <span className={`text-sm font-semibold ${dayHoliday ? 'text-danger' : isToday ? 'text-accent' : 'text-muted'}`}>{day}</span>
              <div className="space-y-1.5 mt-1.5 overflow-y-auto max-h-[220px] custom-scrollbar">
                {dayHoliday && (
                  <div className="bg-danger/10 border border-danger/20 rounded-md px-2 py-1">
                    <p className="text-[11px] font-medium text-danger leading-snug">{dayHoliday.description}</p>
                  </div>
                )}
                {dayEvents.map((ev) => (
                  <div key={ev.id} className="rounded-md px-2 py-1.5 border" style={{ backgroundColor: `${ev.color}1a`, borderColor: `${ev.color}40` }}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: ev.color, color: '#fff' }}>
                        Aula {ev.order}
                      </span>
                      {ev.start_time && <span className="text-[10px] text-muted">{ev.start_time.slice(0, 5)}</span>}
                    </div>
                    <p className="text-xs font-medium leading-snug" style={{ color: ev.color }}>{ev.discipline_name}</p>
                    <p className="text-[10px] text-muted truncate mt-0.5">{ev.course_name}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Dashboard;
