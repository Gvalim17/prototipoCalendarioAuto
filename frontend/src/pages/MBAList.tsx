import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, GraduationCap, ChevronRight, Trash2, ArrowLeft, BookOpen, Settings, X, CheckCircle2 } from 'lucide-react';
import { Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface MBA {
  id: number;
  name: string;
  description: string;
  year: number;
}

interface Module {
  id: number;
  name: string;
  mba_id: number;
  disciplines?: Discipline[];
}

interface Discipline {
  id: number;
  name: string;
  code: string;
  module_id: number;
}

const MBAList = () => {
  const [mbas, setMbas] = useState<MBA[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMBAForm, setShowMBAForm] = useState(false);
  const [editingMBA, setEditingMBA] = useState<MBA | null>(null);
  const [mbaForm, setMBAForm] = useState({ name: '', description: '', year: 2026 });
  
  const navigate = useNavigate();

  useEffect(() => {
    fetchMBAs();
  }, []);

  const fetchMBAs = async () => {
    try {
      const response = await axios.get(`${API_URL}/mbas/`);
      setMbas(response.data);
    } catch (error) {
      console.error('Error fetching MBAs:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveMBA = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMBA) {
        await axios.put(`${API_URL}/mbas/${editingMBA.id}`, mbaForm);
        setEditingMBA(null);
      } else {
        await axios.post(`${API_URL}/mbas/`, mbaForm);
      }
      setMBAForm({ name: '', description: '', year: 2026 });
      setShowMBAForm(false);
      fetchMBAs();
    } catch (err) {
      alert("Erro ao salvar MBA");
    }
  };

  const deleteMBA = async (id: number) => {
    if (window.confirm('Tem certeza que deseja excluir este MBA? Isso removerá todos os módulos e disciplinas vinculadas.')) {
      try {
        await axios.delete(`${API_URL}/mbas/${id}`);
        fetchMBAs();
      } catch (err) {
        alert("Erro ao excluir MBA");
      }
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Gestão de MBAs</h2>
          <p className="text-slate-400 mt-2">Visualize e gerencie os cursos de pós-graduação cadastrados.</p>
        </div>
        <button 
          onClick={() => {
            setEditingMBA(null);
            setMBAForm({ name: '', description: '', year: 2026 });
            setShowMBAForm(true);
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/20 active:scale-95"
        >
          <Plus size={20} />
          Novo MBA
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center text-slate-500">Carregando MBAs...</div>
        ) : mbas.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-slate-900/50 rounded-3xl border border-dashed border-slate-800">
            <GraduationCap size={48} className="mx-auto text-slate-700 mb-4" />
            <p className="text-slate-400">Nenhum MBA cadastrado ainda.</p>
          </div>
        ) : (
          mbas.map((mba) => (
            <div key={mba.id} className="glass p-6 rounded-3xl border border-slate-800 hover:border-blue-500/30 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-colors"></div>
              
              <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-4 text-blue-400">
                <GraduationCap size={24} />
              </div>
              
              <h3 className="text-xl font-bold text-white mb-2">{mba.name}</h3>
              <p className="text-slate-400 text-sm line-clamp-2 mb-6">{mba.description || 'Sem descrição informada.'}</p>
              
              <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-800/50">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ano {mba.year}</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setEditingMBA(mba);
                      setMBAForm({ name: mba.name, description: mba.description || '', year: mba.year });
                      setShowMBAForm(true);
                    }}
                    className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-colors"
                  >
                    <Settings size={18} />
                  </button>
                  <button 
                    onClick={() => deleteMBA(mba.id)}
                    className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button 
                    onClick={() => navigate(`${mba.id}`)}
                    className="flex items-center gap-1 text-blue-400 font-semibold hover:text-blue-300 transition-colors"
                  >
                    Datalhes
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal para MBA */}
      {showMBAForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="glass w-full max-w-lg p-8 rounded-3xl border border-slate-800 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">{editingMBA ? 'Editar MBA' : 'Novo MBA'}</h3>
                <p className="text-slate-400 mt-1">Configure as informações do curso.</p>
              </div>
              <button 
                onClick={() => setShowMBAForm(false)}
                className="p-2 text-slate-500 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={saveMBA} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Nome do MBA</label>
                <input 
                  required
                  type="text" 
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  value={mbaForm.name}
                  onChange={(e) => setMBAForm({...mbaForm, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Descrição</label>
                <textarea 
                  rows={3}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  value={mbaForm.description}
                  onChange={(e) => setMBAForm({...mbaForm, description: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Ano</label>
                <input 
                  required
                  type="number" 
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  value={mbaForm.year}
                  onChange={(e) => setMBAForm({...mbaForm, year: parseInt(e.target.value)})}
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]">
                {editingMBA ? 'Salvar Alterações' : 'Criar MBA'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const MBADetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mba, setMba] = useState<MBA | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [newModuleName, setNewModuleName] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [newDiscipline, setNewDiscipline] = useState({ name: '', code: '' });
  const [discSearchResults, setDiscSearchResults] = useState<any[]>([]);
  const [discSearchTimer, setDiscSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [selectedExistingDisc, setSelectedExistingDisc] = useState<number | null>(null);

  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [editingDiscipline, setEditingDiscipline] = useState<Discipline | null>(null);

  useEffect(() => {
    if (id) {
      fetchDetails();
    }
  }, [id]);

  const fetchDetails = async () => {
    try {
      const mbaRes = await axios.get(`${API_URL}/mbas/`);
      const currentMba = mbaRes.data.find((m: any) => m.id === parseInt(id!));
      setMba(currentMba);

      const modRes = await axios.get(`${API_URL}/mbas/${id}/modules`);
      const modulesWithDisciplines = await Promise.all(modRes.data.map(async (mod: Module) => {
        const discRes = await axios.get(`${API_URL}/modules/${mod.id}/disciplines`);
        return { ...mod, disciplines: discRes.data };
      }));
      setModules(modulesWithDisciplines);
    } catch (error) {
      console.error('Error fetching details:', error);
    }
  };

  const addModule = async () => {
    if (!newModuleName) return;
    try {
      await axios.post(`${API_URL}/modules/`, { name: newModuleName, mba_id: parseInt(id!) });
      setNewModuleName('');
      fetchDetails();
    } catch (error) {
      console.error('Error adding module:', error);
    }
  };

  const updateModule = async (moduleId: number, name: string) => {
    try {
      await axios.put(`${API_URL}/modules/${moduleId}`, { name, mba_id: parseInt(id!) });
      setEditingModule(null);
      fetchDetails();
    } catch (err) {
      alert("Erro ao atualizar módulo");
    }
  };

  const deleteModule = async (moduleId: number) => {
    if (window.confirm('Excluir este módulo apagará todas as disciplinas vinculadas. Continuar?')) {
      try {
        await axios.delete(`${API_URL}/modules/${moduleId}`);
        fetchDetails();
      } catch (error) {
        alert('Erro ao excluir módulo.');
      }
    }
  };

  const searchDisciplines = (query: string) => {
    setNewDiscipline(prev => ({ ...prev, name: query }));
    setSelectedExistingDisc(null);
    if (discSearchTimer) clearTimeout(discSearchTimer);
    if (query.length < 2) { setDiscSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`${API_URL}/disciplines/search?q=${encodeURIComponent(query)}`);
        setDiscSearchResults(res.data);
      } catch { setDiscSearchResults([]); }
    }, 300);
    setDiscSearchTimer(t);
  };

  const selectExistingDiscipline = (disc: any) => {
    setNewDiscipline({ name: disc.name, code: disc.code });
    setSelectedExistingDisc(disc.id);
    setDiscSearchResults([]);
  };

  const addDiscipline = async (moduleId: number) => {
    if (!newDiscipline.name || !newDiscipline.code) return;
    try {
      const payload: any = { ...newDiscipline, module_id: moduleId };
      if (selectedExistingDisc) payload.existing_discipline_id = selectedExistingDisc;
      await axios.post(`${API_URL}/disciplines/`, payload);
      setNewDiscipline({ name: '', code: '' });
      setSelectedExistingDisc(null);
      setDiscSearchResults([]);
      setSelectedModuleId(null);
      fetchDetails();
    } catch (error) {
      console.error('Error adding discipline:', error);
    }
  };

  const updateDiscipline = async (discId: number, name: string, code: string, moduleId: number) => {
    try {
      await axios.put(`${API_URL}/disciplines/${discId}`, { name, code, module_id: moduleId });
      setEditingDiscipline(null);
      fetchDetails();
    } catch (err) {
      alert("Erro ao atualizar disciplina");
    }
  };

  const deleteDiscipline = async (id: number) => {
    if (window.confirm('Excluir esta disciplina?')) {
      try {
        await axios.delete(`${API_URL}/disciplines/${id}`);
        fetchDetails();
      } catch (err) {
        alert("Erro ao excluir disciplina");
      }
    }
  };

  if (!mba) return <div className="text-white p-10">Carregando detalhes...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <button onClick={() => navigate('/mbas')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors w-fit">
        <ArrowLeft size={20} />
        Voltar para lista
      </button>

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">{mba.name}</h2>
          <p className="text-slate-400 mt-1">Gerencie os módulos e disciplinas.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <div className="glass p-6 rounded-3xl border border-slate-800 space-y-6 sticky top-8">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="text-blue-500" size={20} />
              Novo Módulo
            </h3>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Nome do Módulo"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
              />
              <button 
                onClick={addModule}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all"
              >
                Criar Módulo
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {modules.map(mod => (
            <div key={mod.id} className="glass rounded-3xl border border-slate-800 overflow-hidden">
              <div className="p-5 flex items-center justify-between bg-slate-800/20">
                {editingModule?.id === mod.id ? (
                  <div className="flex-1 flex gap-2">
                    <input 
                      autoFocus
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none font-bold"
                      value={editingModule.name}
                      onChange={(e) => setEditingModule({...editingModule, name: e.target.value})}
                    />
                    <button onClick={() => updateModule(mod.id, editingModule.name)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold">OK</button>
                    <button onClick={() => setEditingModule(null)} className="bg-slate-800 text-slate-400 px-4 py-2 rounded-lg text-sm font-bold">X</button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-400">
                        <BookOpen size={20} />
                      </div>
                      <h4 className="font-bold text-white text-lg">{mod.name}</h4>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingModule(mod)} className="p-2 text-slate-400 hover:text-blue-400"><Settings size={18} /></button>
                      <button onClick={() => deleteModule(mod.id)} className="p-2 text-slate-400 hover:text-red-400"><Trash2 size={18} /></button>
                      <button 
                        onClick={() => setSelectedModuleId(selectedModuleId === mod.id ? null : mod.id)}
                        className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm font-semibold"
                      >
                        <Plus size={16} />
                        Disciplina
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="p-5 space-y-3">
                {selectedModuleId === mod.id && (
                  <div className="bg-blue-600/5 border border-blue-500/20 p-4 rounded-2xl mb-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="relative">
                        <input 
                          type="text" placeholder="Nome (buscar ou criar)"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm pr-20"
                          value={newDiscipline.name}
                          onChange={(e) => searchDisciplines(e.target.value)}
                          autoComplete="off"
                        />
                        {selectedExistingDisc && (
                          <span className="absolute right-2 top-2 text-xs text-green-400 flex items-center gap-1">
                            <CheckCircle2 size={11} /> Reutilizando
                          </span>
                        )}
                        {discSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 z-50 bg-slate-900 border border-slate-700 rounded-xl mt-1 overflow-hidden shadow-xl max-h-40 overflow-y-auto">
                            {discSearchResults.map((d: any) => (
                              <button key={d.id} type="button" onClick={() => selectExistingDiscipline(d)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-800 transition-colors">
                                <span className="text-white font-medium">{d.name}</span>
                                <span className="text-slate-500 text-xs ml-2">{d.mba_name} › {d.module_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <input 
                        type="text" placeholder="Código"
                        className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
                        value={newDiscipline.code}
                        onChange={(e) => setNewDiscipline({...newDiscipline, code: e.target.value})}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => addDiscipline(mod.id)} className="flex-1 bg-blue-600 text-white text-xs font-bold py-2 rounded-lg">Salvar</button>
                      <button onClick={() => setSelectedModuleId(null)} className="px-4 bg-slate-800 text-slate-400 text-xs font-bold py-2 rounded-lg">Cancelar</button>
                    </div>
                  </div>
                )}

                {mod.disciplines?.map((disc: any) => (
                  <div key={disc.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-slate-800 group">
                    {editingDiscipline?.id === disc.id ? (
                      <div className="flex-1 flex gap-2">
                        <input className="flex-1 bg-slate-800 border border-slate-700 p-1 text-sm text-white" value={editingDiscipline.name} onChange={e => setEditingDiscipline({...editingDiscipline, name: e.target.value})} />
                        <input className="w-20 bg-slate-800 border border-slate-700 p-1 text-sm text-white font-mono" value={editingDiscipline.code} onChange={e => setEditingDiscipline({...editingDiscipline, code: e.target.value})} />
                        <button onClick={() => updateDiscipline(disc.id, editingDiscipline.name, editingDiscipline.code, mod.id)} className="bg-blue-600 px-2 rounded text-white text-xs">OK</button>
                        <button onClick={() => setEditingDiscipline(null)} className="bg-slate-700 px-2 rounded text-white text-xs">X</button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700 uppercase">{disc.code}</span>
                          <span className="text-sm font-medium text-slate-300">{disc.name}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={() => setEditingDiscipline(disc)} className="p-1.5 text-slate-500 hover:text-blue-400"><Settings size={14} /></button>
                          <button onClick={() => deleteDiscipline(disc.id)} className="p-1.5 text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
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
    </div>
  );
};

const MBAListComponent = () => (
  <Routes>
    <Route path="/" element={<MBAList />} />
    <Route path=":id" element={<MBADetails />} />
  </Routes>
);

export default MBAListComponent;
