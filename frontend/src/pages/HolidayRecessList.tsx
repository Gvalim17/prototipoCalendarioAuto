import { useEffect, useState } from 'react';
import axios from 'axios';
import { Calendar, Plus, Trash2, Info, Upload as UploadIcon } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const HolidayRecessList = () => {
  const [holidays, setHolidays] = useState<any[]>([]);
  const [recesses, setRecesses] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'holidays' | 'recesses'>('holidays');
  const [uploading, setUploading] = useState(false);
  
  // Forms
  const [holidayForm, setHolidayForm] = useState({ date: '', description: '', type: 'nacional' });
  const [recessForm, setRecessForm] = useState({ start_date: '', end_date: '', description: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const hRes = await axios.get(`${API_URL}/holidays/`);
      setHolidays(hRes.data);
      const rRes = await axios.get(`${API_URL}/recesses/`);
      setRecesses(rRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/holidays/`, { ...holidayForm, source: "UERJ" });
      setHolidayForm({ date: '', description: '', type: 'nacional' });
      fetchData();
    } catch (error) {
      alert('Erro ao cadastrar feriado.');
    }
  };

  const addRecess = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_URL}/recesses/`, { ...recessForm, source: "UERJ" });
      setRecessForm({ start_date: '', end_date: '', description: '' });
      fetchData();
    } catch (error) {
      alert('Erro ao cadastrar recesso.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      const res = await axios.post(`${API_URL}/holidays/upload/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert(res.data.message);
      fetchData();
    } catch (error: any) {
      alert('Erro no upload: ' + (error.response?.data?.detail || error.message));
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  const deleteHoliday = async (id: number) => {
    if (window.confirm("Remover este feriado da base 2026?")) {
        try {
            await axios.delete(`${API_URL}/holidays/${id}`);
            fetchData();
        } catch (err) { alert("Erro ao excluir feriado."); }
    }
  };

  const deleteRecess = async (id: number) => {
    if (window.confirm("Remover este recesso institucional?")) {
        try {
            await axios.delete(`${API_URL}/recesses/${id}`);
            fetchData();
        } catch (err) { alert("Erro ao excluir recesso."); }
    }
  };

  const formatDateInfo = (dateStr: string) => {
    // dateStr is YYYY-MM-DD
    const parts = dateStr.split('-');
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return {
      day: parts[2],
      month: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      full: `${parts[2]}/${parts[1]}/${parts[0]}`
    };
  };

  const deleteAll = async () => {
    const type = activeTab === 'holidays' ? 'feriados' : 'recessos';
    if (window.confirm(`ATENÇÃO: Deseja apagar TODOS os ${type}? Esta ação não pode ser desfeita.`)) {
        if (window.confirm(`Você tem CERTEZA absoluta? Isso removerá todos os ${type} da base de dados.`)) {
            try {
                await axios.delete(`${API_URL}/${activeTab}/all`);
                fetchData();
            } catch (err) { alert(`Erro ao limpar ${type}.`); }
        }
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase">Calendário Institucional</h2>
          <p className="text-slate-400 mt-2 font-medium">Controle de feriados e recessos acadêmicos 2026.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex gap-2 p-1 bg-slate-900/50 border border-slate-800 rounded-2xl w-fit">
          <button 
            onClick={() => setActiveTab('holidays')}
            className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
              activeTab === 'holidays' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Feriados Oficiais
          </button>
          <button 
            onClick={() => setActiveTab('recesses')}
            className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
              activeTab === 'recesses' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Recessos Institucionais
          </button>
        </div>

        <button 
            onClick={deleteAll}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-red-500/20 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/50 transition-all font-black text-[10px] uppercase tracking-widest"
        >
            <Trash2 size={16} />
            Limpar Base
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário lateral */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass p-8 rounded-[40px] border border-slate-800 shadow-2xl space-y-8 bg-gradient-to-br from-blue-600/5 to-transparent">
            <h3 className="text-lg font-black text-white flex items-center gap-2 uppercase tracking-tighter">
              <Plus size={24} className="text-blue-500" />
              {activeTab === 'holidays' ? 'Novo Feriado' : 'Novo Recesso'}
            </h3>
            
            {activeTab === 'holidays' ? (
              <form onSubmit={addHoliday} className="space-y-6">
                <FormGroup label="Data do Evento">
                  <input 
                    required type="date"
                    className="input-custom"
                    value={holidayForm.date}
                    onChange={(e) => setHolidayForm({...holidayForm, date: e.target.value})}
                  />
                </FormGroup>
                <FormGroup label="Descrição / Nome">
                  <input 
                    required type="text" placeholder="Ex: Dia do Mestre"
                    className="input-custom"
                    value={holidayForm.description}
                    onChange={(e) => setHolidayForm({...holidayForm, description: e.target.value})}
                  />
                </FormGroup>
                <FormGroup label="Tipo">
                  <select 
                    className="select-custom"
                    value={holidayForm.type}
                    onChange={(e) => setHolidayForm({...holidayForm, type: e.target.value})}
                  >
                    <option value="nacional">Nacional</option>
                    <option value="estadual">Estadual</option>
                    <option value="uerj">UERJ / Municipal</option>
                  </select>
                </FormGroup>
                <button type="submit" className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl transition-all shadow-xl shadow-blue-500/30 uppercase tracking-tighter">
                  Registrar Feriado
                </button>
              </form>
            ) : (
              <form onSubmit={addRecess} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormGroup label="Início">
                    <input 
                      required type="date"
                      className="input-custom"
                      value={recessForm.start_date}
                      onChange={(e) => setRecessForm({...recessForm, start_date: e.target.value})}
                    />
                  </FormGroup>
                  <FormGroup label="Fim">
                    <input 
                      required type="date"
                      className="input-custom"
                      value={recessForm.end_date}
                      onChange={(e) => setRecessForm({...recessForm, end_date: e.target.value})}
                    />
                  </FormGroup>
                </div>
                <FormGroup label="Descrição">
                  <input 
                    required type="text" placeholder="Ex: Recesso de Natal"
                    className="input-custom"
                    value={recessForm.description}
                    onChange={(e) => setRecessForm({...recessForm, description: e.target.value})}
                  />
                </FormGroup>
                <button type="submit" className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl transition-all shadow-xl shadow-blue-500/30 uppercase tracking-tighter">
                  Registrar Recesso
                </button>
              </form>
            )}
          </div>

          {activeTab === 'holidays' && (
            <div className="glass p-6 rounded-3xl border border-dashed border-slate-700 bg-blue-500/5 hover:border-blue-500/50 transition-all text-center">
              <label className="cursor-pointer block space-y-3 py-4">
                <input 
                  type="file" 
                  accept=".csv, .xlsx, .xls"
                  className="hidden" 
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                  <UploadIcon size={24} />
                </div>
                <div>
                  <h4 className="text-white font-black text-xs uppercase">Importar Lista</h4>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-tighter">
                    {uploading ? 'Processando...' : 'Arraste ou selecione CSV / Excel'}
                  </p>
                </div>
              </label>
            </div>
          )}

          <div className="glass p-6 rounded-3xl border border-slate-800 bg-amber-500/5">
             <div className="flex items-center gap-2 text-amber-500 mb-3">
                <Info size={18} />
                <h4 className="font-bold text-[10px] uppercase tracking-widest">Importante</h4>
             </div>
             <p className="text-[11px] text-slate-500 leading-relaxed italic">
                A inclusão de novos feriados impactará imediatamente a geração de cronogramas, ignorando estas datas durante o cálculo.
             </p>
          </div>
        </div>

        {/* Listagem principal */}
        <div className="lg:col-span-2">
          {activeTab === 'holidays' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {holidays.length === 0 ? (
                <div className="col-span-full text-center py-20 text-slate-600 font-bold italic">Nenhum feriado na base de dados.</div>
              ) : (
                holidays.sort((a,b) => a.date.localeCompare(b.date)).map(h => (
                  <div key={h.id} className="glass p-5 rounded-3xl border border-slate-800 flex items-center justify-between group hover:border-blue-500/30 transition-all backdrop-blur-3xl">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <span className="text-[8px] font-black uppercase opacity-60 leading-none mb-1">
                            {formatDateInfo(h.date).month}
                        </span>
                        <span className="text-xl font-black leading-none">{formatDateInfo(h.date).day}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-extrabold text-white uppercase text-xs tracking-tighter truncate">{h.description}</h4>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest px-2 py-0.5 bg-slate-900 rounded-md border border-slate-800">{h.type}</span>
                            <span className="text-[10px] text-slate-600 font-medium">2026</span>
                        </div>
                      </div>
                    </div>
                    <button 
                        onClick={() => deleteHoliday(h.id)}
                        className="p-3 text-slate-700 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {recesses.length === 0 ? (
                <div className="text-center py-20 text-slate-600 font-bold italic">Nenhum recesso cadastrado.</div>
              ) : (
                recesses.map(r => (
                  <div key={r.id} className="glass p-6 rounded-3xl border border-slate-800 flex items-center justify-between group bg-gradient-to-r from-purple-500/5 to-transparent hover:border-purple-500/30 transition-all">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20">
                        <Calendar size={28} />
                      </div>
                      <div>
                        <h4 className="font-black text-white text-base uppercase tracking-tight mb-1">{r.description}</h4>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-400 font-bold">
                                {formatDateInfo(r.start_date).full} até {formatDateInfo(r.end_date).full}
                            </span>
                            <div className="w-1 h-1 rounded-full bg-slate-700"></div>
                            <span className="text-[10px] text-purple-400 font-black uppercase">Férias Acadêmicas</span>
                        </div>
                      </div>
                    </div>
                    <button 
                        onClick={() => deleteRecess(r.id)}
                        className="p-4 text-slate-700 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const FormGroup = ({ label, children }: any) => (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{label}</label>
      {children}
    </div>
);

export default HolidayRecessList;
