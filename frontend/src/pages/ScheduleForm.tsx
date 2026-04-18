import { useState, useEffect } from 'react';
import { Calendar, BookOpen, CheckCircle2, AlertCircle, Info, ArrowLeft, ChevronRight, Hash, Clock, CalendarDays, List as ListIcon, HelpCircle, GraduationCap, Coffee, Download, Star } from 'lucide-react';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

const ScheduleForm = () => {
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(1);
    const [mbas, setMbas] = useState<any[]>([]);
    const [modules, setModules] = useState<any[]>([]);
    const [disciplines, setDisciplines] = useState<any[]>([]);
    const [holidays, setHolidays] = useState<any[]>([]);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [generatedResult, setGeneratedResult] = useState<{ dates: string[], skipped: any[] }>({ dates: [], skipped: [] });
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
    
    // State for Calendar Grid
    const [currentMonth, setCurrentMonth] = useState(new Date());
    
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [pickerMonth, setPickerMonth] = useState(new Date());

    // RF-09: conflict override state
    const [conflictOverrides, setConflictOverrides] = useState<Record<string, string>>({});
    const [activeConflictPicker, setActiveConflictPicker] = useState<string | null>(null);
    const [conflictPickerMonth, setConflictPickerMonth] = useState(new Date());
    const [showRecalcModal, setShowRecalcModal] = useState(false);
    const [pendingOverride, setPendingOverride] = useState<{ conflictDate: string; overrideDate: string } | null>(null);
    
    const [formData, setFormData] = useState({
        mba_id: 0,
        module_id: 0,
        discipline_id: 0,
        format: 'presencial',
        workload: 24,
        start_date: '',
        recurrence: 'quinzenal',
        day_of_week: 5, 
        num_classes: 4
    });

    useEffect(() => {
        fetchMBAs();
        fetchHolidays();
    }, []);

    const fetchMBAs = async () => {
        try {
            const res = await axios.get(`${API_BASE}/mbas/`);
            setMbas(res.data);
        } catch (err) {
            console.error("Erro ao buscar MBAs", err);
        }
    };

    const fetchHolidays = async () => {
        try {
            const res = await axios.get(`${API_BASE}/holidays/`);
            setHolidays(res.data);
        } catch (err) {
            console.error("Erro ao buscar feriados");
        }
    };

    const fetchModules = async (mbaId: number) => {
        try {
            const res = await axios.get(`${API_BASE}/mbas/${mbaId}/modules`);
            setModules(res.data);
            setFormData(prev => ({ ...prev, module_id: 0, discipline_id: 0 }));
        } catch (err) {
            console.error("Erro ao buscar módulos");
        }
    };

    const fetchDisciplines = async (moduleId: number) => {
        try {
            const res = await axios.get(`${API_BASE}/modules/${moduleId}/disciplines`);
            setDisciplines(res.data);
            setFormData(prev => ({ ...prev, discipline_id: 0 }));
        } catch (err) {
            console.error("Erro ao buscar disciplinas");
        }
    };

    const handleGenerate = async () => {
        if (!formData.discipline_id || !formData.start_date) {
            alert("Preencha todos os campos obrigatórios.");
            return;
        }

        setLoading(true);
        setShowConfirmation(false);
        try {
            const startDateObj = new Date(formData.start_date + 'T00:00:00');
            const jsDay = startDateObj.getDay(); 
            const pyDay = jsDay === 0 ? 6 : jsDay - 1; 

            const res = await axios.post(`${API_BASE}/generate-schedule/`, {
                ...formData,
                day_of_week: pyDay
            });
            setGeneratedResult({ dates: res.data.dates, skipped: res.data.skipped });
            
            if (res.data.dates.length > 0) {
                setCurrentMonth(new Date(res.data.dates[0] + 'T00:00:00'));
            }
            
            setStep(2);
        } catch (err: any) {
            alert("Erro ao gerar: " + (err.response?.data?.detail || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleFinalSave = async () => {
        setLoading(true);
        try {
            const payload = {
                config: {
                    ...formData,
                    day_of_week: new Date(formData.start_date + 'T00:00:00').getDay() === 0 ? 6 : new Date(formData.start_date + 'T00:00:00').getDay() - 1
                },
                classes: generatedResult.dates.map((d, i) => ({
                    date: d,
                    order: i + 1
                }))
            };
            await axios.post(`${API_BASE}/schedules/`, payload);
            alert("Cronograma salvo e registrado com sucesso!");
            setStep(1);
        } catch (err: any) {
            alert("Erro ao salvar cronograma: " + (err.response?.data?.detail || err.message));
        } finally {
            setLoading(false);
        }
    };

    // RF-09: apply conflict override
    const applyOverride = (conflictDate: string, overrideDate: string) => {
        setActiveConflictPicker(null);
        setPendingOverride({ conflictDate, overrideDate });
        setShowRecalcModal(true);
    };

    const confirmOverrideWithRecalc = () => {
        setShowRecalcModal(false);
        setConflictOverrides({});
        setPendingOverride(null);
        handleGenerate();
    };

    const confirmOverrideNoRecalc = () => {
        if (!pendingOverride) return;
        const { conflictDate, overrideDate } = pendingOverride;
        setConflictOverrides(prev => ({ ...prev, [conflictDate]: overrideDate }));
        const newSkipped = generatedResult.skipped.filter(s => s.date !== conflictDate);
        const newDates = [...generatedResult.dates, overrideDate].sort();
        setGeneratedResult({ dates: newDates, skipped: newSkipped });
        setShowRecalcModal(false);
        setPendingOverride(null);
    };

    // RF-12: export preview as xlsx
    const handleExportPreview = async () => {
        try {
            const { mba, mod, disc } = getSelectionLabels();
            const res = await axios.post(`${API_BASE}/schedules/export-preview/xlsx`, {
                mba_name: mba || 'MBA',
                module_name: mod || 'Módulo',
                discipline_name: disc || 'Disciplina',
                format: formData.format,
                workload: formData.workload,
                dates: generatedResult.dates,
                recurrence: formData.recurrence,
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
            alert('Erro ao exportar cronograma.');
        }
    };

    const checkHolidayProximity = (dateStr: string) => {
        const classDate = new Date(dateStr + 'T00:00:00');
        const warningDays = 2; 
        
        for (const holiday of holidays) {
            const hDate = new Date(holiday.date + 'T00:00:00');
            const diffTime = hDate.getTime() - classDate.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays <= warningDays && diffDays >= -warningDays && diffDays !== 0) {
                return holiday;
            }
        }
        return null;
    };

    // Calendar Helper Functions
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const renderCalendarGrid = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        const days = [];

        // Adding empty cells for days before the 1st
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-24 border border-slate-800/30"></div>);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isClass = generatedResult.dates.indexOf(dateStr) !== -1;
            const classIndex = generatedResult.dates.indexOf(dateStr) + 1;
            const holiday = holidays.find(h => h.date === dateStr);
            const nearHoliday = !holiday ? checkHolidayProximity(dateStr) : null;
            const skipped = generatedResult.skipped.find(s => s.date === dateStr);

            days.push(
                <div key={d} className={`h-24 border border-slate-800/50 p-2 relative transition-all group hover:bg-slate-800/20 ${holiday || skipped ? 'bg-slate-900/40' : ''}`}>
                    <span className={`text-[10px] font-bold ${holiday || skipped ? 'text-slate-600' : 'text-slate-500'}`}>{d}</span>
                    
                    <div className="mt-1 flex flex-col gap-1">
                        {isClass && (
                            <div className={`${formData.recurrence === 'na' ? 'bg-purple-600 shadow-purple-500/20' : 'bg-blue-600 shadow-blue-500/20'} shadow-lg text-white text-[9px] font-black py-1 px-2 rounded-lg flex items-center justify-between animate-in zoom-in-75`}>
                                <span>{formData.recurrence === 'na' ? 'MASTER CLASS' : `AULA ${classIndex}`}</span>
                                {formData.recurrence === 'na' ? <Star size={10} /> : <CheckCircle2 size={10} />}
                            </div>
                        )}
                        {holiday && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[8px] font-black py-1 px-1.5 rounded-md truncate uppercase tracking-tighter" title={holiday.description}>
                                {holiday.description}
                            </div>
                        )}
                        {skipped && (
                            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] font-black py-1 px-1.5 rounded-md truncate uppercase tracking-tighter" title={skipped.reason}>
                                BLOQUEADO
                            </div>
                        )}
                        {nearHoliday && isClass && (
                            <div className="flex items-center gap-1 text-amber-500/80 animate-pulse mt-1" title={`Próximo a: ${nearHoliday.description}`}>
                                <AlertCircle size={10} />
                                <span className="text-[7px] font-bold uppercase">Emenda?</span>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return days;
    };

    const getSelectionLabels = () => {
        const mba = mbas.find(m => m.id === formData.mba_id)?.name;
        const mod = modules.find(m => m.id === formData.module_id)?.name;
        const disc = disciplines.find(d => d.id === formData.discipline_id)?.name;
        return { mba, mod, disc };
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">Gerador Inteligente</h2>
                    <p className="text-slate-400">Ponto facultativo e cronograma automático.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm ${step === 1 ? 'bg-blue-600 shadow-lg shadow-blue-500/20' : 'bg-blue-600/30'} text-white transition-all`}>1</div>
                    <div className="w-12 h-0.5 bg-slate-800"></div>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm ${step === 2 ? 'bg-blue-600 shadow-lg shadow-blue-500/20' : 'bg-slate-800'} text-slate-500 transition-all`}>2</div>
                </div>
            </div>

            {step === 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <section className="glass rounded-3xl p-8 border border-slate-800 space-y-6 shadow-xl">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
                                <BookOpen className="text-blue-500" size={20} />
                                Estrutura Acadêmica
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormGroup label="MBA / Curso" icon={<GraduationCap size={14} className="text-blue-500" />}>
                                    <div className="relative group/input">
                                        <select 
                                            className="select-custom"
                                            value={formData.mba_id}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                setFormData({...formData, mba_id: val});
                                                if (val) fetchModules(val);
                                            }}
                                        >
                                            <option value={0}>Selecione o MBA</option>
                                            {mbas.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    </div>
                                </FormGroup>

                                <FormGroup label="Módulo" icon={<BookOpen size={14} className="text-emerald-500" />}>
                                    <div className="relative group/input">
                                        <select 
                                            disabled={!formData.mba_id}
                                            className="select-custom"
                                            value={formData.module_id}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                setFormData({...formData, module_id: val});
                                                if (val) fetchDisciplines(val);
                                            }}
                                        >
                                            <option value={0}>Selecione o Módulo</option>
                                            {modules.map(mod => <option key={mod.id} value={mod.id}>{mod.name}</option>)}
                                        </select>
                                    </div>
                                </FormGroup>

                                <FormGroup label="Disciplina" icon={<CheckCircle2 size={14} className="text-blue-400" />}>
                                    <div className="relative group/input">
                                        <select 
                                            disabled={!formData.module_id}
                                            className="select-custom"
                                            value={formData.discipline_id}
                                            onChange={(e) => setFormData({...formData, discipline_id: parseInt(e.target.value)})}
                                        >
                                            <option value={0}>Selecione a Disciplina</option>
                                            {disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                </FormGroup>

                                <FormGroup label="Formato" icon={<Coffee size={14} className="text-rose-400" />}>
                                    <div className="relative group/input">
                                        <select 
                                            className="select-custom"
                                            value={formData.format}
                                            onChange={(e) => setFormData({...formData, format: e.target.value})}
                                        >
                                            <option value="presencial">Presencial</option>
                                            <option value="remoto">Remoto / Online</option>
                                        </select>
                                    </div>
                                </FormGroup>
                            </div>
                        </section>

                        <section className="glass rounded-3xl p-8 border border-slate-800 space-y-6 shadow-xl">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
                                <Calendar className="text-emerald-500" size={20} />
                                Parâmetros de Cronograma
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormGroup label="Data Inicial" icon={<CalendarDays size={14} className="text-emerald-500" />}>
                                    <div className="relative">
                                        <button 
                                            type="button"
                                            onClick={() => setShowDatePicker(!showDatePicker)}
                                            className="input-custom flex items-center justify-between group hover:border-emerald-500/30 transition-all"
                                        >
                                            <span className={formData.start_date ? 'text-white' : 'text-slate-500'}>
                                                {formData.start_date ? new Date(formData.start_date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Selecione a data'}
                                            </span>
                                            <Calendar size={16} className="text-slate-500 group-hover:text-emerald-400 transition-colors" />
                                        </button>

                                        {showDatePicker && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setShowDatePicker(false)}></div>
                                                <div className="absolute top-full left-0 mt-3 w-[280px] glass rounded-3xl border border-slate-800 shadow-2xl z-50 p-4 animate-in fade-in zoom-in-95 duration-200 origin-top-left">
                                                    <div className="flex items-center justify-between mb-4 px-1">
                                                        <span className="text-[10px] font-black text-white uppercase tracking-tighter">
                                                            {pickerMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                                        </span>
                                                        <div className="flex gap-1">
                                                            <button 
                                                                type="button" onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))}
                                                                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"
                                                            >
                                                                <ArrowLeft size={12} />
                                                            </button>
                                                            <button 
                                                                type="button" onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))}
                                                                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"
                                                            >
                                                                <ChevronRight size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-7 mb-2">
                                                        {['D','S','T','Q','Q','S','S'].map(d => (
                                                            <div key={d} className="text-center text-[8px] font-black text-slate-600 py-1">{d}</div>
                                                        ))}
                                                    </div>

                                                    <div className="grid grid-cols-7 gap-1">
                                                        {(() => {
                                                            const year = pickerMonth.getFullYear();
                                                            const month = pickerMonth.getMonth();
                                                            const daysInMonth = getDaysInMonth(year, month);
                                                            const firstDay = getFirstDayOfMonth(year, month);
                                                            const cells = [];

                                                            for (let i = 0; i < firstDay; i++) {
                                                                cells.push(<div key={`empty-${i}`} className="h-8"></div>);
                                                            }

                                                            for (let d = 1; d <= daysInMonth; d++) {
                                                                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                                                const isSelected = formData.start_date === dateStr;
                                                                const holiday = holidays.find(h => h.date === dateStr);
                                                                
                                                                cells.push(
                                                                    <button
                                                                        key={d}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setFormData({...formData, start_date: dateStr});
                                                                            setShowDatePicker(false);
                                                                        }}
                                                                        className={`
                                                                            h-8 rounded-xl flex items-center justify-center text-[10px] font-bold transition-all relative group/day
                                                                            ${isSelected ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}
                                                                            ${holiday ? 'text-rose-400' : ''}
                                                                        `}
                                                                    >
                                                                        {d}
                                                                        {holiday && (
                                                                            <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50"></div>
                                                                        )}
                                                                        {holiday && (
                                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[7px] text-white opacity-0 group-hover/day:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                                                                                {holiday.description}
                                                                            </div>
                                                                        )}
                                                                    </button>
                                                                );
                                                            }
                                                            return cells;
                                                        })()}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </FormGroup>

                                <FormGroup label="Recorrência" icon={<ListIcon size={14} className="text-amber-500" />}>
                                    <select
                                        className="select-custom"
                                        value={formData.recurrence}
                                        onChange={(e) => {
                                            const rec = e.target.value;
                                            setFormData({ ...formData, recurrence: rec, num_classes: rec === 'na' ? 1 : formData.num_classes });
                                        }}
                                    >
                                        <option value="semanal">Semanal</option>
                                        <option value="quinzenal">Quinzenal</option>
                                        <option value="na">Master Class (Evento Único)</option>
                                    </select>
                                </FormGroup>

                                <FormGroup label="Carga Horária (Total)" icon={<Hash size={14} className="text-blue-500" />}>
                                    <div className="relative group/input">
                                        <input
                                            type="number" className="input-custom"
                                            value={formData.workload}
                                            placeholder="Ex: 24"
                                            onChange={(e) => setFormData({...formData, workload: parseInt(e.target.value)})}
                                        />
                                    </div>
                                </FormGroup>

                                {formData.recurrence !== 'na' && (
                                    <FormGroup label="Quantidade de Aulas" icon={<Clock size={14} className="text-amber-400" />}>
                                        <div className="relative group/input">
                                            <input
                                                type="number" className="input-custom"
                                                value={formData.num_classes}
                                                placeholder="Ex: 4"
                                                onChange={(e) => setFormData({...formData, num_classes: parseInt(e.target.value)})}
                                            />
                                        </div>
                                    </FormGroup>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className="space-y-6">
                        <div className="glass rounded-3xl p-6 border border-slate-800 bg-gradient-to-br from-blue-600/5 to-transparent">
                            <h4 className="font-bold text-white mb-4 flex items-center gap-2">
                                <Info size={18} className="text-blue-400" />
                                Inteligência Ponto Facultativo
                            </h4>
                            <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                O sistema alertará se aulas caírem próximas a feriados, permitindo prever emendas acadêmicas.
                            </p>
                            <ul className="space-y-3 text-[11px] text-slate-500 font-medium">
                                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"></div> Detecção de feriados e recessos institucionais</li>
                                <li className="flex gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0"></div> Sugestão automática de recalendário</li>
                            </ul>
                        </div>

                        <button 
                            onClick={() => setShowConfirmation(true)}
                            className="w-full h-20 bg-blue-600 hover:bg-blue-700 text-white rounded-3xl font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-2xl shadow-blue-500/30"
                            disabled={loading}
                        >
                            CALCULAR CRONOGRAMA
                            <ChevronRight />
                        </button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-8 animate-in fade-in duration-700">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-3xl font-bold text-white tracking-tight">Estratégia de Datas</h2>
                            <p className="text-slate-400">Verifique os feriados bloqueados e os alertas de emenda.</p>
                        </div>
                        <div className="flex gap-3">
                             <div className="bg-slate-900 border border-slate-800 p-1 rounded-2xl flex gap-1">
                                <button 
                                    onClick={() => setViewMode('list')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-xs font-bold ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                >
                                    <ListIcon size={14} /> Lista
                                </button>
                                <button 
                                    onClick={() => setViewMode('calendar')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all text-xs font-bold ${viewMode === 'calendar' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                                >
                                    <CalendarDays size={14} /> Calendário
                                </button>
                            </div>
                            <button
                                onClick={handleExportPreview}
                                className="flex items-center gap-2 bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-400 border border-emerald-800/50 px-6 py-3 rounded-2xl font-bold transition-all text-xs active:scale-95 uppercase tracking-tighter"
                            >
                                <Download size={16} /> .xlsx
                            </button>
                            <button
                                onClick={() => setStep(1)}
                                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-3 rounded-2xl font-bold transition-all text-xs border border-slate-700"
                            >
                                <ArrowLeft size={16} /> Ajustar
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-4">
                           {viewMode === 'list' ? (
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {generatedResult.dates.map((dateStr, idx) => {
                                        const holiday = checkHolidayProximity(dateStr);
                                        return (
                                            <div key={idx} className={`glass rounded-2xl p-6 border ${holiday ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-800'} flex items-center gap-5 group hover:border-blue-500/40 transition-all relative overflow-hidden backdrop-blur-xl`}>
                                                <div className="w-14 h-14 rounded-2xl bg-blue-600/10 flex flex-col items-center justify-center text-blue-400 font-black border border-blue-500/20">
                                                    <span className="text-[10px] leading-none mb-1 opacity-50 uppercase">Aula</span>
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1">
                                                        {formData.recurrence === 'na' ? 'Master Class' : 'Encontro Confirmado'}
                                                    </p>
                                                    <h4 className="text-lg font-bold text-white capitalize">
                                                        {new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                                                    </h4>
                                                    {holiday && (
                                                        <div className="flex items-center gap-1.5 mt-2 text-amber-500 animate-pulse bg-amber-500/10 py-1 px-2 rounded-lg w-fit">
                                                            <AlertCircle size={12} />
                                                            <span className="text-[10px] font-black uppercase tracking-tight">Atenção: {holiday.description}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                           ) : (
                               <div className="glass rounded-[40px] p-0 border border-slate-800 overflow-hidden shadow-2xl">
                                   <div className="bg-slate-900/50 p-6 flex items-center justify-between border-b border-slate-800">
                                       <h3 className="font-black text-white text-xl uppercase tracking-tighter">
                                           {currentMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                       </h3>
                                       <div className="flex gap-2">
                                           <button 
                                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                                                className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"
                                            >
                                                <ArrowLeft size={18} />
                                            </button>
                                           <button 
                                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                                                className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white"
                                            >
                                                <ChevronRight size={18} />
                                            </button>
                                       </div>
                                   </div>
                                   
                                   <div className="grid grid-cols-7 border-b border-slate-800/30">
                                       {['DOM','SEG','TER','QUA','QUI','SEX','SAB'].map(d => (
                                           <div key={d} className="py-4 text-center text-[10px] font-black text-slate-500 tracking-widest bg-slate-950/20">{d}</div>
                                       ))}
                                   </div>

                                   <div className="grid grid-cols-7">
                                       {renderCalendarGrid()}
                                   </div>

                                   <div className="p-6 bg-slate-950/40 grid grid-cols-2 md:grid-cols-4 gap-4">
                                       <LegendItem color="bg-blue-600" label="Aula Confirmada" />
                                       <LegendItem color="bg-red-500/20 border border-red-500/40" label="Feriado Bloqueado" />
                                       <LegendItem color="bg-amber-500/20 border border-amber-500/40" label="Recesso/Limitação" />
                                       <LegendItem color="text-amber-500 font-bold" icon={<AlertCircle size={14}/>} label="Ponto Facultativo" />
                                   </div>
                               </div>
                           )}
                        </div>

                        <div className="space-y-6">
                            <div className="glass rounded-3xl p-6 border border-slate-800 relative bg-gradient-to-br from-amber-500/5 to-transparent">
                                <h4 className="font-bold text-white mb-6 flex items-center gap-2 uppercase tracking-wide text-xs">
                                    <AlertCircle size={18} className="text-amber-400" />
                                    Detecção de Conflitos
                                </h4>
                                {generatedResult.skipped.length > 0 ? (
                                    <div className="space-y-3">
                                        {generatedResult.skipped.map((s, i) => (
                                            <div key={i} className="p-4 rounded-xl bg-slate-900/50 border border-amber-500/10 group hover:border-amber-500/30 transition-all">
                                                <div className="flex gap-3 items-start">
                                                    <div className="text-amber-500 pt-1 group-hover:scale-110 transition-transform flex-shrink-0"><AlertCircle size={14} /></div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-black text-amber-500 mb-0.5 uppercase tracking-tighter">
                                                            {new Date(s.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                                                        </p>
                                                        <p className="text-[10px] text-slate-500 font-medium leading-tight">{s.reason}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            setActiveConflictPicker(activeConflictPicker === s.date ? null : s.date);
                                                            setConflictPickerMonth(new Date(s.date + 'T00:00:00'));
                                                        }}
                                                        className="text-[9px] font-black text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded-lg transition-all uppercase tracking-tight whitespace-nowrap flex-shrink-0"
                                                    >
                                                        Repor Data
                                                    </button>
                                                </div>
                                                {activeConflictPicker === s.date && (
                                                    <div className="mt-3 glass rounded-2xl border border-slate-700 p-3 animate-in fade-in zoom-in-95 duration-200">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-[9px] font-black text-white uppercase tracking-tighter">
                                                                {conflictPickerMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                                                            </span>
                                                            <div className="flex gap-1">
                                                                <button type="button" onClick={() => setConflictPickerMonth(new Date(conflictPickerMonth.getFullYear(), conflictPickerMonth.getMonth() - 1, 1))} className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white">
                                                                    <ArrowLeft size={10} />
                                                                </button>
                                                                <button type="button" onClick={() => setConflictPickerMonth(new Date(conflictPickerMonth.getFullYear(), conflictPickerMonth.getMonth() + 1, 1))} className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white">
                                                                    <ChevronRight size={10} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-7 mb-1">
                                                            {['D','S','T','Q','Q','S','S'].map((d, di) => (
                                                                <div key={di} className="text-center text-[7px] font-black text-slate-600 py-0.5">{d}</div>
                                                            ))}
                                                        </div>
                                                        <div className="grid grid-cols-7 gap-0.5">
                                                            {(() => {
                                                                const y = conflictPickerMonth.getFullYear();
                                                                const m = conflictPickerMonth.getMonth();
                                                                const days = getDaysInMonth(y, m);
                                                                const first = getFirstDayOfMonth(y, m);
                                                                const cells = [];
                                                                for (let ei = 0; ei < first; ei++) cells.push(<div key={`e-${ei}`} className="h-7"></div>);
                                                                for (let d = 1; d <= days; d++) {
                                                                    const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                                                    const isHol = holidays.find(h => h.date === ds);
                                                                    const isSelected = conflictOverrides[s.date] === ds;
                                                                    cells.push(
                                                                        <button key={d} type="button"
                                                                            onClick={() => !isHol && applyOverride(s.date, ds)}
                                                                            disabled={!!isHol}
                                                                            className={`h-7 rounded-lg flex items-center justify-center text-[9px] font-bold transition-all ${isSelected ? 'bg-blue-600 text-white' : isHol ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                                                                        >{d}</button>
                                                                    );
                                                                }
                                                                return cells;
                                                            })()}
                                                        </div>
                                                        <p className="text-[8px] text-slate-600 mt-2 text-center">Datas em vermelho = feriados (bloqueadas)</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <p className="text-sm text-slate-600 italic">Nenhum conflito nas datas geradas.</p>
                                    </div>
                                )}
                            </div>

                            <div className="glass p-8 rounded-3xl border border-slate-800 bg-emerald-500/5 shadow-2xl shadow-emerald-500/10">
                                <div className="flex justify-between items-start mb-8">
                                    <div>
                                        <p className="text-[11px] text-emerald-400 font-black uppercase tracking-widest">Resumo Final</p>
                                        <h3 className="text-2xl font-black text-white mt-1">Status: Pronto</h3>
                                    </div>
                                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                                        <CheckCircle2 size={24} />
                                    </div>
                                </div>
                                <div className="space-y-4 mb-10 border-t border-slate-800 pt-6">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500 font-medium tracking-tight">Carga Horária Planejada</span>
                                        <span className="text-white font-black">{formData.workload}h</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500 font-medium tracking-tight">Total de Encontros</span>
                                        <span className="text-white font-black">{generatedResult.dates.length} Aulas</span>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleFinalSave}
                                    disabled={loading}
                                    className="w-full h-20 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[24px] font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-2xl shadow-emerald-500/30 uppercase tracking-tighter"
                                >
                                    {loading ? 'MODULANDO...' : 'EFETIVAR CRONOGRAMA'}
                                    <ChevronRight />
                                </button>
                                <p className="text-[10px] text-slate-500 text-center mt-6 font-medium leading-relaxed italic">
                                    Ao clicar em efetivar, as datas serão persistidas e ficarão visíveis para os alunos no App Mobile.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showRecalcModal && pendingOverride && (
                <div className="fixed inset-0 bg-[#060a14]/95 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="glass max-w-md w-full p-10 rounded-[40px] border border-slate-800 shadow-2xl space-y-8 animate-in zoom-in-95 duration-300">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 rounded-[24px] bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                                <AlertCircle size={32} />
                            </div>
                            <h3 className="text-2xl font-black text-white tracking-tighter uppercase">Reposição Definida</h3>
                            <p className="text-slate-400 text-sm">
                                Data escolhida:{' '}
                                <span className="text-white font-black">
                                    {new Date(pendingOverride.overrideDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                                </span>
                            </p>
                            <p className="text-slate-500 text-xs">Deseja recalcular todo o cronograma com base na configuração original?</p>
                        </div>
                        <div className="flex gap-4">
                            <button
                                onClick={confirmOverrideNoRecalc}
                                className="flex-1 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold transition-all border border-slate-800 text-xs uppercase tracking-tighter"
                            >
                                Não, apenas adicionar
                            </button>
                            <button
                                onClick={confirmOverrideWithRecalc}
                                className="flex-1 py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black transition-all shadow-lg shadow-amber-500/20 text-xs uppercase tracking-tighter"
                            >
                                Sim, Recalcular
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showConfirmation && (
                <div className="fixed inset-0 bg-[#060a14]/95 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="glass max-w-lg w-full p-10 rounded-[40px] border border-slate-800 shadow-2xl space-y-8 animate-in zoom-in-95 duration-300">
                        <div className="text-center space-y-2">
                            <div className="w-20 h-20 rounded-[30px] bg-blue-600/10 text-blue-400 flex items-center justify-center mx-auto mb-6 border border-blue-500/20">
                                <HelpCircle size={40} />
                            </div>
                            <h3 className="text-3xl font-black text-white tracking-tighter uppercase">Revisar Parâmetros</h3>
                            <p className="text-slate-400 text-sm">Confirme se as regras estão corretas antes de gerar.</p>
                        </div>
                        
                        <div className="glass rounded-[32px] p-8 border border-white/5 space-y-4 bg-slate-900/40">
                            <ConfirmRow label="MBA / CURSO" value={getSelectionLabels().mba || '-'} />
                            <ConfirmRow label="DISCIPLINA" value={getSelectionLabels().disc || '-'} />
                            <div className="h-px bg-slate-800 my-4"></div>
                            <ConfirmRow label="DATA INICIAL" value={formData.start_date ? new Date(formData.start_date + 'T00:00:00').toLocaleDateString('pt-BR') : '-'} />
                            <ConfirmRow label="MODALIDADE" value={formData.format} />
                            <ConfirmRow label="QUANTIDADE" value={`${formData.num_classes} Encontros`} />
                        </div>

                        <div className="flex gap-4">
                            <button 
                                onClick={() => setShowConfirmation(false)}
                                className="flex-1 py-5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold transition-all border border-slate-800"
                            >
                                Ajustar
                            </button>
                            <button 
                                onClick={handleGenerate}
                                className="flex-1 py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black transition-all shadow-lg shadow-blue-500/20 uppercase tracking-tighter"
                            >
                                GERAR AGORA
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const FormGroup = ({ label, children, icon }: any) => (
  <div className="space-y-2.5">
    <div className="flex items-center gap-2 ml-1">
        {icon}
        <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest">{label}</label>
    </div>
    {children}
  </div>
);

const ConfirmRow = ({ label, value }: { label: string, value: any }) => (
    <div className="flex justify-between items-center text-xs">
        <span className="text-slate-500 font-bold tracking-widest">{label}</span>
        <span className="text-white font-black text-right ml-4 uppercase tracking-tighter">{value}</span>
    </div>
);

const LegendItem = ({ color, label, icon }: any) => (
    <div className="flex items-center gap-2">
        {icon ? icon : <div className={`w-3 h-3 rounded-full ${color}`}></div>}
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{label}</span>
    </div>
);

export default ScheduleForm;
