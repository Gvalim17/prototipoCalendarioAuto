import { useState, useEffect } from 'react';
import { GraduationCap, BookOpen, Coffee, Calendar as CalendarIcon, ChevronRight, AlertCircle, Clock, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

const Dashboard = () => {
  const [stats, setStats] = useState({
    mbas: 0,
    modules: 0,
    disciplines: 0,
    holidays: 0
  });
  const [nextHolidays, setNextHolidays] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab ] = useState<'overview' | 'calendar'>('overview');
  const [allMbas, setAllMbas] = useState<any[]>([]);
  
  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date()); 
  const [allSchedules, setAllSchedules] = useState<any[]>([]);
  const [allHolidays, setAllHolidays] = useState<any[]>([]);
  const [nextClasses, setNextClasses] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [mbas, holidays, schedules] = await Promise.all([
        axios.get(`${API_BASE}/mbas/`),
        axios.get(`${API_BASE}/holidays/`),
        axios.get(`${API_BASE}/schedules/`)
      ]);

      setAllMbas(mbas.data);
      setAllSchedules(schedules.data);
      setAllHolidays(holidays.data);
      
      const today = new Date().toISOString().split('T')[0];
      
      const totalModules = mbas.data.reduce((acc: number, m: any) => acc + (m.modules?.length || 0), 0);
      const totalDisciplines = mbas.data.reduce((acc: number, m: any) => acc + (m.modules?.reduce((acc2: number, mod: any) => acc2 + (mod.disciplines?.length || 0), 0) || 0), 0);

      setStats({
        mbas: mbas.data.length,
        modules: totalModules,
        disciplines: totalDisciplines,
        holidays: holidays.data.length
      });

      const futureHolidays = holidays.data
        .filter((h: any) => h.date >= today)
        .sort((a: any, b: any) => a.date.localeCompare(b.date))
        .slice(0, 3);
      setNextHolidays(futureHolidays);

      const futureClasses = schedules.data
        .filter((s: any) => s.date >= today)
        .sort((a: any, b: any) => a.date.localeCompare(b.date))
        .slice(0, 4);
      setNextClasses(futureClasses);

    } catch (err) {
      console.error("Erro ao carregar Dashboard", err);
    } finally {
      setLoading(false);
    }
  };

  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));

  if (loading) return <div className="flex items-center justify-center h-96 text-blue-500 font-black animate-pulse uppercase tracking-widest">Carregando painel...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Painel Estratégico</h2>
          <p className="text-slate-400 mt-2 font-medium">Gestão acadêmica e controle de calendários 2026.</p>
        </div>
        
        <div className="flex bg-slate-900/50 p-1 border border-slate-800 rounded-2xl">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
              activeTab === 'overview' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Resumo
          </button>
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
              activeTab === 'calendar' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Calendário Geral
          </button>
        </div>

        <div className="flex gap-3">
           <button 
             onClick={async () => {
               if(confirm("Tem certeza que deseja apagar TODOS os cronogramas? Esta ação não pode ser desfeita.")) {
                 await axios.delete(`${API_BASE}/schedules/all`);
                 fetchDashboardData();
               }
             }}
             className="flex items-center gap-2 bg-slate-900 hover:bg-rose-900/40 text-rose-500 border border-slate-800 px-6 py-3 rounded-2xl font-black text-xs transition-all active:scale-95 uppercase tracking-tighter"
           >
            <AlertCircle size={18} />
            Reset Total
          </button>
           <Link to="/generate" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-black text-xs transition-all shadow-xl shadow-blue-500/20 active:scale-95 uppercase tracking-tighter">
            <CalendarIcon size={18} />
            Novo Cronograma
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={<GraduationCap className="text-blue-500" />} 
          label="Cursos MBAs" 
          value={stats.mbas} 
          trend="+2 este mês"
          color="blue"
          to="/mbas"
        />
        <StatCard 
          icon={<BookOpen className="text-emerald-500" />} 
          label="Módulos" 
          value={stats.modules || '--'} 
          trend="Ativos"
          color="emerald"
          to="/mbas"
        />
        <StatCard 
          title="Disciplinas" 
          value={stats.disciplines} 
          label="Cadastradas" 
          icon={<Clock size={24} className="text-amber-500" />}
          to="/disciplines"
        >
          <div className="mt-4 pt-4 border-t border-slate-800/50 space-y-2">
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Próximos Inícios:</p>
            {(() => {
              const uniqueDisciplines = nextClasses
                .filter((v, i, a) => a.findIndex(t => t.discipline_id === v.discipline_id) === i)
                .slice(0, 3);
              
              return uniqueDisciplines.length > 0 ? uniqueDisciplines.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-2 group/item">
                  <span className="text-[9px] font-bold text-slate-400 truncate max-w-[100px] group-hover/item:text-amber-400 transition-colors">{d.discipline_name}</span>
                  <span className="text-[9px] font-black text-white shrink-0 bg-slate-800 px-1.5 py-0.5 rounded-md border border-slate-700">
                    {new Date(d.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
              )) : (
                <p className="text-[9px] text-slate-600 italic">Sem inícios previstos</p>
              );
            })()}
          </div>
        </StatCard>
        <StatCard 
          icon={<Coffee className="text-rose-500" />} 
          label="Feriados '26" 
          value={stats.holidays} 
          trend="Oficial"
          color="rose"
          to="/holidays"
        />
      </div>

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <section className="glass rounded-[40px] p-8 border border-slate-800 shadow-2xl relative overflow-hidden bg-gradient-to-br from-blue-600/5 to-transparent min-h-[400px]">
               <div className="flex justify-between items-center mb-8">
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter">Fluxo de MBAs Ativos</h3>
                  <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full uppercase">Cadastrados</span>
               </div>
               
               <div className="space-y-6">
                  {allMbas.length > 0 ? allMbas.map((mba, i) => {
                    const totalDisciplines = mba.modules.reduce((acc: number, mod: any) => acc + mod.disciplines.length, 0);
                    
                    return (
                      <div key={i} className="flex flex-col p-6 rounded-[40px] bg-slate-900/40 border border-slate-800 hover:border-blue-500/20 transition-all group animate-in slide-in-from-bottom-2 duration-500">
                          {/* Top Section */}
                          <div className="flex items-start justify-between mb-6">
                              <div className="flex items-center gap-5">
                                  <div className="w-16 h-16 rounded-[28px] bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-lg">
                                      <GraduationCap size={32} />
                                  </div>
                                  <div>
                                      <h4 className="text-xl font-black text-white uppercase tracking-tighter">{mba.name}</h4>
                                      <div className="flex items-center gap-3 mt-1">
                                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{mba.year || 2026} • Acadêmico</span>
                                          <div className="w-1 h-1 rounded-full bg-slate-700"></div>
                                          <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{totalDisciplines} Disciplinas</span>
                                      </div>
                                  </div>
                              </div>
                              <div className="flex items-center gap-3">
                                  <button className="p-3 rounded-2xl bg-slate-800/50 hover:bg-slate-800 text-slate-500 hover:text-white transition-all border border-slate-700/50">
                                      <Clock size={16} />
                                  </button>
                                  <Link to={`/mbas/${mba.id}`} className="flex items-center gap-2 bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl active:scale-95">
                                      Detalhes
                                      <ChevronRight size={14} />
                                  </Link>
                              </div>
                          </div>

                          {/* Content Section (Modules & Disciplines) */}
                          {mba.modules.length > 0 && (
                            <div className="mt-2 space-y-4">
                                <div className="h-px bg-gradient-to-r from-slate-800 via-slate-800 to-transparent mb-6"></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {mba.modules.map((mod: any, idx: number) => (
                                      <div key={idx} className="p-4 rounded-3xl bg-slate-950/30 border border-slate-800/50 hover:bg-slate-900/50 transition-all group/mod">
                                          <div className="flex items-center gap-2 mb-3">
                                              <div className="w-1.5 h-6 rounded-full bg-blue-500/50"></div>
                                              <h5 className="text-[10px] font-black text-white uppercase tracking-widest opacity-70 group-hover/mod:opacity-100 transition-opacity">{mod.name}</h5>
                                          </div>
                                          <ul className="space-y-1.5 ml-3">
                                              {mod.disciplines.map((disc: any, dIdx: number) => (
                                                <li key={dIdx} className="flex items-center gap-2 text-[10px] text-slate-500 font-medium group/disc">
                                                    <div className="w-1 h-1 rounded-full bg-slate-700 group-hover/disc:bg-blue-400"></div>
                                                    <span className="group-hover/disc:text-slate-300 transition-colors">{disc.name}</span>
                                                </li>
                                              ))}
                                              {mod.disciplines.length === 0 && (
                                                <li className="text-[9px] text-slate-600 italic ml-3">Nenhuma disciplina cadastrada</li>
                                              )}
                                          </ul>
                                      </div>
                                    ))}
                                </div>
                            </div>
                          )}

                          {mba.modules.length === 0 && (
                            <div className="mt-4 p-4 rounded-3xl border border-dashed border-slate-800 text-center">
                                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Aguardando definição de grade curricular</p>
                            </div>
                          )}
                      </div>
                    );
                  }) : (
                    <div className="flex flex-col items-center justify-center h-[200px] text-center space-y-4">
                        <div className="w-20 h-20 rounded-[30px] bg-slate-900 flex items-center justify-center border border-slate-800 text-slate-700">
                            <GraduationCap size={40} />
                        </div>
                        <div>
                            <h4 className="text-white font-bold opacity-40">Nenhum MBA cadastrado</h4>
                            <p className="text-xs text-slate-600 max-w-[200px] mx-auto mt-2">Os cursos registrados aparecerão aqui.</p>
                        </div>
                    </div>
                  )}
               </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="glass rounded-[40px] p-8 border border-slate-800 shadow-xl bg-slate-900/50">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <Coffee size={14} className="text-rose-500" />
                Feriados Próximos
              </h3>
              <div className="space-y-4">
                {nextHolidays.length > 0 ? nextHolidays.map((holiday, i) => (
                  <Link key={i} to="/holidays" className="flex items-center gap-4 p-4 rounded-2xl bg-slate-950/50 border border-slate-800 group hover:border-rose-500/30 transition-all cursor-pointer">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex flex-col items-center justify-center text-rose-500 font-black border border-rose-500/20 group-hover:bg-rose-600 group-hover:text-white transition-all">
                      <span className="text-[8px] leading-tight opacity-50 uppercase">{new Date(holiday.date + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short' })}</span>
                      {new Date(holiday.date + 'T00:00:00').getDate()}
                    </div>
                    <div>
                      <p className="text-xs font-black text-white leading-tight uppercase tracking-tighter group-hover:text-rose-400 transition-colors">{holiday.description}</p>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{holiday.type}</span>
                    </div>
                  </Link>
                )) : (
                  <p className="text-xs text-slate-600 italic px-2">Nenhum feriado próximo.</p>
                )}
              </div>
              <Link to="/holidays" className="mt-8 flex items-center justify-center gap-2 bg-slate-950/40 hover:bg-slate-900 border border-slate-800 text-slate-500 hover:text-white px-5 py-4 rounded-[24px] font-black text-[10px] uppercase tracking-widest transition-all group/btn shadow-xl">
                  Ver todos os feriados
                  <ChevronRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
              </Link>
            </section>

            <section className="glass rounded-[40px] p-8 border border-slate-800 shadow-xl bg-slate-900/50">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2 text-blue-400">
                <Clock size={14} />
                Próximas Aulas
              </h3>
              <div className="space-y-4">
                {nextClasses.length > 0 ? nextClasses.map((s, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-950/50 border border-slate-800 group hover:border-blue-500/30 transition-all">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex flex-col items-center justify-center text-blue-400 font-black border border-blue-500/20 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-glow-blue">
                      <span className="text-[8px] leading-tight opacity-50 uppercase">{new Date(s.date + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'short' })}</span>
                      {new Date(s.date + 'T00:00:00').getDate()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-white leading-tight uppercase tracking-tighter truncate group-hover:text-blue-400 transition-colors">{s.discipline_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest truncate">{s.mba_name}</span>
                        <div className="w-1 h-1 rounded-full bg-slate-700"></div>
                        <span className={`text-[8px] font-black uppercase ${s.format === 'presencial' ? 'text-emerald-500' : 'text-blue-400'}`}>{s.format}</span>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-6">
                    <p className="text-[10px] text-slate-600 italic font-bold uppercase tracking-widest opacity-50">Nenhuma aula agendada</p>
                  </div>
                )}
              </div>
            </section>

            <section className="glass rounded-[40px] p-8 border border-slate-800 bg-gradient-to-br from-amber-500/5 to-transparent">
               <div className="flex items-center gap-2 text-amber-500 mb-4">
                  <AlertCircle size={20} />
                  <h4 className="font-bold text-xs uppercase tracking-widest">Aviso Acadêmico</h4>
               </div>
               <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                  O Calendário Institucional 2026 prevê suspensão de atividades facultativas nos períodos de Carnaval e Corpus Christi. O sistema bloqueará automaticamente estas datas.
               </p>
            </section>
          </div>
        </div>
      ) : (
        <CalendarView 
          currentMonth={currentMonth} 
          onNext={nextMonth} 
          onPrev={prevMonth} 
          schedules={allSchedules}
          holidays={allHolidays}
        />
      )}
    </div>
  );
};

const StatCard = ({ icon, label, value, trend, color, to }: any) => {
  const colors: any = {
    blue: 'border-blue-500/10 from-blue-600/20 to-transparent hover:border-blue-500/40',
    emerald: 'border-emerald-500/10 from-emerald-600/20 to-transparent hover:border-emerald-500/40',
    amber: 'border-amber-500/10 from-amber-600/20 to-transparent hover:border-amber-500/40',
    rose: 'border-rose-500/10 from-rose-600/20 to-transparent hover:border-rose-500/40'
  }
  
  const CardContent = (
    <>
      <div className="flex justify-between items-start mb-6">
        <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 group-hover:border-slate-700 transition-all">
          {icon}
        </div>
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest bg-slate-900/50 px-2 py-1 rounded-lg">{trend}</span>
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-4xl font-black text-white tracking-tighter">{value}</p>
      </div>
    </>
  );

  return to ? (
    <Link to={to} className={`glass rounded-[32px] p-6 border bg-gradient-to-br ${colors[color]} shadow-lg transition-all hover:scale-[1.02] active:scale-95 group`}>
      {CardContent}
    </Link>
  ) : (
    <div className={`glass rounded-[32px] p-6 border bg-gradient-to-br ${colors[color]} shadow-lg transition-all hover:scale-[1.02] cursor-default group`}>
      {CardContent}
    </div>
  );
};

const CalendarView = ({ currentMonth, onNext, onPrev, schedules, holidays }: any) => {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="glass rounded-[40px] p-8 border border-slate-800 shadow-2xl space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
         <h3 className="text-2xl font-black text-white uppercase tracking-tighter">{monthName}</h3>
         <div className="flex gap-2">
            <button onClick={onPrev} className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 text-slate-400 hover:text-white transition-all">
               <ChevronRight className="rotate-180" size={20} />
            </button>
            <button onClick={onNext} className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500/50 text-slate-400 hover:text-white transition-all">
               <ChevronRight size={20} />
            </button>
         </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {dayNames.map(d => (
          <div key={d} className="text-center py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">{d}</div>
        ))}
        
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="h-32 rounded-3xl bg-slate-900/10 border border-dashed border-slate-800/30"></div>
        ))}
        
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          
          // Filtragem mais robusta para evitar problemas com espaços ou formatos ligeiramente diferentes
          const dayEvents = schedules.filter((s: any) => s.date.split('T')[0] === dateStr);
          const dayHoliday = holidays.find((h: any) => h.date.split('T')[0] === dateStr);
          const isToday = new Date().toISOString().split('T')[0] === dateStr;

          return (
            <div key={day} className={`h-32 rounded-3xl border transition-all p-3 space-y-2 group overflow-hidden ${
              dayHoliday ? 'bg-rose-500/10 border-rose-500/30' : 
              isToday ? 'bg-blue-600/10 border-blue-500/50' : 
              'bg-slate-900/30 border-slate-800 hover:border-slate-600'
            }`}>
              <div className="flex justify-between items-start">
                  <span className={`text-sm font-black ${dayHoliday ? 'text-rose-400' : isToday ? 'text-blue-400' : 'text-slate-500'}`}>{day}</span>
                  {dayHoliday && <Coffee size={14} className="text-rose-500 animate-bounce" />}
                  {dayEvents.length > 0 && !dayHoliday && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>}
              </div>
              <div className="space-y-1 overflow-y-auto max-h-[80px] custom-scrollbar">
                {dayHoliday && (
                  <div className="bg-rose-600/20 border border-rose-500/30 rounded-lg p-1.5 mb-1">
                    <p className="text-[8px] font-black text-rose-300 uppercase leading-none truncate">{dayHoliday.description}</p>
                    <p className="text-[7px] text-rose-400/60 mt-0.5 uppercase font-bold tracking-widest">{dayHoliday.type}</p>
                  </div>
                )}
                  {dayEvents.map((ev: any, idx: number) => {
                    const colorMap: any = {
                      0: 'blue',
                      1: 'emerald',
                      2: 'amber',
                      3: 'rose',
                      4: 'indigo'
                    };
                    const color = colorMap[ev.id % 5] || 'blue';
                    
                    return (
                      <div key={idx} className={`bg-${color}-600/20 border border-${color}-500/30 rounded-lg p-1.5 hover:bg-${color}-600/40 transition-colors cursor-help group/ev`} title={`${ev.mba_name} - Aula ${ev.order}`}>
                        <p className={`text-[8px] font-black text-${color}-300 uppercase leading-none truncate`}>{ev.mba_name}</p>
                        <p className="text-[7px] text-slate-500 mt-1 truncate group-hover/ev:text-slate-300 transition-colors">{ev.discipline_name}</p>
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Dashboard;
