import { useEffect, useState } from 'react';
import api from '../api/client';
import { Plus, GraduationCap, ChevronRight, Trash2, ArrowLeft, BookOpen, Settings, X, CheckCircle2, Building2, FileText } from 'lucide-react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { ACADEMIC_LEVELS, levelLabel, type AcademicLevel, type Course, type Discipline, type Module } from '../types/domain';
import LessonPlanModal from '../components/LessonPlanModal';

interface DisciplineSearchResult {
  id: number;
  name: string;
  code: string;
  module_name: string;
  course_name: string;
}

interface CourseForm {
  name: string;
  institution: string;
  academic_level: AcademicLevel;
  academic_level_other: string;
  description: string;
  year: number;
  semester: string; // '' | '1' | '2'
}

const emptyForm: CourseForm = { name: '', institution: '', academic_level: 'graduacao', academic_level_other: '', description: '', year: new Date().getFullYear(), semester: '' };

const CourseList = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState<CourseForm>(emptyForm);
  const [filterLevel, setFilterLevel] = useState<string>('');

  const navigate = useNavigate();

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const response = await api.get<Course[]>(`/courses/`);
      setCourses(response.data);
    } catch (error) {
      console.error('Erro ao buscar cursos:', error);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (c: Course) => {
    setEditing(c);
    setForm({
      name: c.name,
      institution: c.institution || '',
      academic_level: c.academic_level,
      academic_level_other: c.academic_level_other || '',
      description: c.description || '',
      year: c.year,
      semester: c.semester ? String(c.semester) : '',
    });
    setShowForm(true);
  };

  const saveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.academic_level === 'outro' && !form.academic_level_other.trim()) {
      alert('Informe o nome do nível acadêmico em "Outro".');
      return;
    }
    const payload = {
      name: form.name,
      institution: form.institution || null,
      academic_level: form.academic_level,
      academic_level_other: form.academic_level === 'outro' ? form.academic_level_other.trim() : null,
      description: form.description || null,
      year: form.year,
      semester: form.semester ? Number(form.semester) : null,
    };
    try {
      if (editing) {
        await api.put(`/courses/${editing.id}`, payload);
      } else {
        await api.post(`/courses/`, payload);
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditing(null);
      fetchCourses();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      alert(detail || 'Erro ao salvar curso.');
    }
  };

  const deleteCourse = async (id: number) => {
    if (window.confirm('Excluir este curso? Isso removerá todos os módulos e disciplinas vinculados.')) {
      try {
        await api.delete(`/courses/${id}`);
        fetchCourses();
      } catch {
        alert('Erro ao excluir curso.');
      }
    }
  };

  const visible = filterLevel ? courses.filter((c) => c.academic_level === filterLevel) : courses;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink tracking-tight">Cursos</h2>
          <p className="text-muted mt-1 text-sm">Cadastro de instituições, níveis acadêmicos e cursos.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="select-custom w-auto h-11"
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
          >
            <option value="">Todos os níveis</option>
            {ACADEMIC_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <button onClick={openNew} className="btn-primary">
            <Plus size={18} /> Novo curso
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-20 text-center text-muted">Carregando cursos...</div>
        ) : visible.length === 0 ? (
          <div className="col-span-full py-16 text-center card border-dashed">
            <GraduationCap size={40} className="mx-auto text-faint mb-3" />
            <p className="text-muted">Nenhum curso cadastrado.</p>
          </div>
        ) : (
          visible.map((course) => {
            const totalDisc = course.modules.reduce((a, m) => a + (m.disciplines?.length || 0), 0);
            return (
              <div key={course.id} className="card p-5 flex flex-col hover:border-accent/40 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-2 py-1 rounded-md">
                    {levelLabel(course.academic_level, course.academic_level_other)}
                  </span>
                  <span className="text-xs text-muted">{course.year}{course.semester ? `/${course.semester}` : ''}</span>
                </div>
                <h3 className="text-lg font-semibold text-ink mb-1">{course.name}</h3>
                {course.institution && (
                  <p className="text-xs text-muted flex items-center gap-1.5 mb-2">
                    <Building2 size={13} /> {course.institution}
                  </p>
                )}
                <p className="text-sm text-muted line-clamp-2 mb-4">{course.description || 'Sem descrição.'}</p>

                <div className="flex items-center justify-between mt-auto pt-3 border-t border-line">
                  <span className="text-xs text-muted">{course.modules.length} módulos · {totalDisc} disciplinas</span>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(course)} className="p-2 text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors">
                      <Settings size={16} />
                    </button>
                    <button onClick={() => deleteCourse(course.id)} className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors">
                      <Trash2 size={16} />
                    </button>
                    <button onClick={() => navigate(`${course.id}`)} className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-colors">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
          <div className="card w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-start mb-5">
              <h3 className="text-xl font-semibold text-ink">{editing ? 'Editar curso' : 'Novo curso'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 text-muted hover:text-ink transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveCourse} className="space-y-4">
              <Field label="Instituição">
                <input type="text" className="input-custom" placeholder="Ex: Universidade Federal"
                  value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nível acadêmico">
                  <select className="select-custom" value={form.academic_level}
                    onChange={(e) => setForm({ ...form, academic_level: e.target.value as AcademicLevel })}>
                    {ACADEMIC_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </Field>
                <Field label="Semestre (opcional)">
                  <select className="select-custom" value={form.semester}
                    onChange={(e) => setForm({ ...form, semester: e.target.value })}>
                    <option value="">—</option>
                    <option value="1">1º semestre</option>
                    <option value="2">2º semestre</option>
                  </select>
                </Field>
              </div>
              {form.academic_level === 'outro' && (
                <Field label="Qual nível acadêmico?">
                  <input required type="text" className="input-custom" placeholder="Ex: Curso livre, Aperfeiçoamento..."
                    value={form.academic_level_other} onChange={(e) => setForm({ ...form, academic_level_other: e.target.value })} />
                </Field>
              )}
              <Field label="Nome do curso">
                <input required type="text" className="input-custom" placeholder="Ex: Engenharia de Software"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Descrição">
                <textarea rows={3} className="input-custom h-auto py-2.5 resize-none"
                  value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <Field label="Ano">
                <input required type="number" className="input-custom"
                  value={form.year} onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) || form.year })} />
              </Field>
              <button type="submit" className="btn-primary w-full h-12">
                {editing ? 'Salvar alterações' : 'Criar curso'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-muted">{label}</label>
    {children}
  </div>
);

const CourseDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [newModuleName, setNewModuleName] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [newDiscipline, setNewDiscipline] = useState({ name: '', code: '' });
  const [discSearchResults, setDiscSearchResults] = useState<DisciplineSearchResult[]>([]);
  const [discSearchTimer, setDiscSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [selectedExistingDisc, setSelectedExistingDisc] = useState<number | null>(null);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [editingDiscipline, setEditingDiscipline] = useState<Discipline | null>(null);
  const [planningDiscipline, setPlanningDiscipline] = useState<Discipline | null>(null);

  useEffect(() => {
    if (id) fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchDetails = async () => {
    try {
      const courseRes = await api.get<Course[]>(`/courses/`);
      setCourse(courseRes.data.find((c) => c.id === parseInt(id!)) ?? null);

      const modRes = await api.get<Module[]>(`/courses/${id}/modules`);
      const withDisc = await Promise.all(modRes.data.map(async (mod) => {
        const discRes = await api.get<Discipline[]>(`/modules/${mod.id}/disciplines`);
        return { ...mod, disciplines: discRes.data };
      }));
      setModules(withDisc);
    } catch (error) {
      console.error('Erro ao buscar detalhes:', error);
    }
  };

  const addModule = async () => {
    if (!newModuleName) return;
    try {
      await api.post(`/modules/`, { name: newModuleName, course_id: parseInt(id!) });
      setNewModuleName('');
      fetchDetails();
    } catch (error) {
      console.error('Erro ao adicionar módulo:', error);
    }
  };

  const updateModule = async (moduleId: number, name: string) => {
    try {
      await api.put(`/modules/${moduleId}`, { name, course_id: parseInt(id!) });
      setEditingModule(null);
      fetchDetails();
    } catch {
      alert('Erro ao atualizar módulo');
    }
  };

  const deleteModule = async (moduleId: number) => {
    if (window.confirm('Excluir este módulo apagará todas as disciplinas vinculadas. Continuar?')) {
      try {
        await api.delete(`/modules/${moduleId}`);
        fetchDetails();
      } catch {
        alert('Erro ao excluir módulo.');
      }
    }
  };

  const searchDisciplines = (query: string) => {
    setNewDiscipline((prev) => ({ ...prev, name: query }));
    setSelectedExistingDisc(null);
    if (discSearchTimer) clearTimeout(discSearchTimer);
    if (query.length < 2) { setDiscSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get<DisciplineSearchResult[]>(`/disciplines/search?q=${encodeURIComponent(query)}`);
        setDiscSearchResults(res.data);
      } catch { setDiscSearchResults([]); }
    }, 300);
    setDiscSearchTimer(t);
  };

  const selectExistingDiscipline = (disc: DisciplineSearchResult) => {
    setNewDiscipline({ name: disc.name, code: disc.code });
    setSelectedExistingDisc(disc.id);
    setDiscSearchResults([]);
  };

  const addDiscipline = async (moduleId: number) => {
    if (!newDiscipline.name || !newDiscipline.code) return;
    try {
      const payload: { name: string; code: string; module_id: number; existing_discipline_id?: number } = { ...newDiscipline, module_id: moduleId };
      if (selectedExistingDisc) payload.existing_discipline_id = selectedExistingDisc;
      await api.post(`/disciplines/`, payload);
      setNewDiscipline({ name: '', code: '' });
      setSelectedExistingDisc(null);
      setDiscSearchResults([]);
      setSelectedModuleId(null);
      fetchDetails();
    } catch (error) {
      console.error('Erro ao adicionar disciplina:', error);
      alert('Erro ao adicionar disciplina. Verifique se o código já existe.');
    }
  };

  const updateDiscipline = async (discId: number, name: string, code: string, moduleId: number) => {
    try {
      await api.put(`/disciplines/${discId}`, { name, code, module_id: moduleId });
      setEditingDiscipline(null);
      fetchDetails();
    } catch {
      alert('Erro ao atualizar disciplina');
    }
  };

  const deleteDiscipline = async (discId: number) => {
    if (window.confirm('Excluir esta disciplina?')) {
      try {
        await api.delete(`/disciplines/${discId}`);
        fetchDetails();
      } catch {
        alert('Erro ao excluir disciplina');
      }
    }
  };

  if (!course) return <div className="text-muted p-10">Carregando detalhes...</div>;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/courses')} className="flex items-center gap-2 text-muted hover:text-ink transition-colors w-fit text-sm">
        <ArrowLeft size={18} /> Voltar
      </button>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded-md">{levelLabel(course.academic_level, course.academic_level_other)}</span>
          {course.institution && <span className="text-xs text-muted">· {course.institution}</span>}
        </div>
        <h2 className="text-2xl font-semibold text-ink tracking-tight">{course.name}</h2>
        <p className="text-muted mt-1 text-sm">Gerencie os módulos e disciplinas.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="card p-5 space-y-4 sticky top-4">
            <h3 className="text-base font-semibold text-ink flex items-center gap-2">
              <Plus className="text-accent" size={18} /> Novo módulo
            </h3>
            <input type="text" placeholder="Nome do módulo" className="input-custom"
              value={newModuleName} onChange={(e) => setNewModuleName(e.target.value)} />
            <button onClick={addModule} className="btn-primary w-full">Criar módulo</button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {modules.length === 0 && (
            <div className="card border-dashed p-10 text-center text-muted text-sm">Nenhum módulo cadastrado.</div>
          )}
          {modules.map((mod) => (
            <div key={mod.id} className="card overflow-hidden">
              <div className="p-4 flex items-center justify-between bg-surface-2 border-b border-line">
                {editingModule?.id === mod.id ? (
                  <div className="flex-1 flex gap-2">
                    <input autoFocus className="flex-1 bg-surface border border-line rounded-lg px-3 py-1.5 text-ink outline-none font-medium"
                      value={editingModule.name} onChange={(e) => setEditingModule({ ...editingModule, name: e.target.value })} />
                    <button onClick={() => updateModule(mod.id, editingModule.name)} className="btn-primary h-9 px-3">OK</button>
                    <button onClick={() => setEditingModule(null)} className="btn-ghost h-9 px-3">X</button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center text-accent"><BookOpen size={18} /></div>
                      <h4 className="font-semibold text-ink">{mod.name}</h4>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditingModule(mod)} className="p-2 text-muted hover:text-accent"><Settings size={16} /></button>
                      <button onClick={() => deleteModule(mod.id)} className="p-2 text-muted hover:text-danger"><Trash2 size={16} /></button>
                      <button onClick={() => setSelectedModuleId(selectedModuleId === mod.id ? null : mod.id)} className="btn-ghost h-9 px-3 text-xs">
                        <Plus size={14} /> Disciplina
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="p-4 space-y-2">
                {selectedModuleId === mod.id && (
                  <div className="bg-accent/5 border border-accent/20 p-3 rounded-xl mb-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="relative col-span-2">
                        <input type="text" placeholder="Nome (buscar ou criar)" autoComplete="off"
                          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-ink text-sm"
                          value={newDiscipline.name} onChange={(e) => searchDisciplines(e.target.value)} />
                        {selectedExistingDisc && (
                          <span className="absolute right-2 top-2 text-xs text-ok flex items-center gap-1"><CheckCircle2 size={11} /> Reutilizando</span>
                        )}
                        {discSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 z-50 card mt-1 overflow-hidden shadow-xl max-h-40 overflow-y-auto">
                            {discSearchResults.map((d) => (
                              <button key={d.id} type="button" onClick={() => selectExistingDiscipline(d)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors">
                                <span className="text-ink font-medium">{d.name}</span>
                                <span className="text-muted text-xs ml-2">{d.course_name} › {d.module_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input type="text" placeholder="Código"
                        className="bg-surface border border-line rounded-lg px-3 py-2 text-ink text-sm"
                        value={newDiscipline.code} onChange={(e) => setNewDiscipline({ ...newDiscipline, code: e.target.value })} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => addDiscipline(mod.id)} className="btn-primary flex-1 h-9 text-xs">Salvar</button>
                      <button onClick={() => setSelectedModuleId(null)} className="btn-ghost h-9 px-4 text-xs">Cancelar</button>
                    </div>
                  </div>
                )}

                {mod.disciplines?.length === 0 && (
                  <p className="text-xs text-muted italic px-1 py-2">Nenhuma disciplina cadastrada.</p>
                )}
                {mod.disciplines?.map((disc) => (
                  <div key={disc.id} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-2 border border-line group">
                    {editingDiscipline?.id === disc.id ? (
                      <div className="flex-1 flex gap-2">
                        <input className="flex-1 bg-surface border border-line rounded p-1.5 text-sm text-ink" value={editingDiscipline.name} onChange={(e) => setEditingDiscipline({ ...editingDiscipline, name: e.target.value })} />
                        <input className="w-24 bg-surface border border-line rounded p-1.5 text-sm text-ink font-mono" value={editingDiscipline.code} onChange={(e) => setEditingDiscipline({ ...editingDiscipline, code: e.target.value })} />
                        <button onClick={() => updateDiscipline(disc.id, editingDiscipline.name, editingDiscipline.code, mod.id)} className="btn-primary h-8 px-2 text-xs">OK</button>
                        <button onClick={() => setEditingDiscipline(null)} className="btn-ghost h-8 px-2 text-xs">X</button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono bg-surface text-muted px-2 py-1 rounded border border-line uppercase">{disc.code}</span>
                          <span className="text-sm text-ink">{disc.name}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setPlanningDiscipline(disc)} title="Planejar (PTD)" className="p-1.5 text-muted hover:text-accent"><FileText size={14} /></button>
                          <button onClick={() => setEditingDiscipline(disc)} className="p-1.5 text-muted hover:text-accent"><Settings size={14} /></button>
                          <button onClick={() => deleteDiscipline(disc.id)} className="p-1.5 text-muted hover:text-danger"><Trash2 size={14} /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {planningDiscipline && (
        <LessonPlanModal
          disciplineId={planningDiscipline.id}
          disciplineName={planningDiscipline.name}
          onClose={() => setPlanningDiscipline(null)}
        />
      )}
    </div>
  );
};

const CourseListComponent = () => (
  <Routes>
    <Route path="/" element={<CourseList />} />
    <Route path=":id" element={<CourseDetails />} />
  </Routes>
);

export default CourseListComponent;
