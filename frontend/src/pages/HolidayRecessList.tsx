import { ReactNode, useEffect, useRef, useState } from 'react';
import api from '../api/client';
import { AlertCircle, CalendarRange, CheckCircle2, FileText, Plus, Trash2, Info, Upload as UploadIcon, X } from 'lucide-react';
import type { Holiday, Recess } from '../types/domain';

interface HolidayImportResult {
  message: string;
  total: number;
  total_rows: number;
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

const HolidayRecessList = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [recesses, setRecesses] = useState<Recess[]>([]);
  const [activeTab, setActiveTab] = useState<'holidays' | 'recesses'>('holidays');
  const [uploading, setUploading] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<HolidayImportResult | null>(null);
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [holidayForm, setHolidayForm] = useState({ date: '', description: '', type: 'nacional' });
  const [recessForm, setRecessForm] = useState({ start_date: '', end_date: '', description: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const hRes = await api.get<Holiday[]>(`/holidays/`);
      setHolidays(hRes.data);
      const rRes = await api.get<Recess[]>(`/recesses/`);
      setRecesses(rRes.data);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    }
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/holidays/`, { ...holidayForm, source: 'Institucional' });
      setHolidayForm({ date: '', description: '', type: 'nacional' });
      fetchData();
    } catch {
      alert('Erro ao cadastrar feriado.');
    }
  };

  const addRecess = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/recesses/`, { ...recessForm, source: 'Institucional' });
      setRecessForm({ start_date: '', end_date: '', description: '' });
      fetchData();
    } catch (error) {
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      alert(detail || 'Erro ao cadastrar recesso.');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImportFile(file);
    setImportResult(null);
  };

  const importSelectedFile = async () => {
    if (!selectedImportFile) return;
    const formData = new FormData();
    formData.append('file', selectedImportFile);
    formData.append('year', String(importYear));
    try {
      setUploading(true);
      const res = await api.post(`/holidays/upload/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data);
      setSelectedImportFile(null);
      fetchData();
    } catch (error) {
      const apiError = error as { response?: { data?: { detail?: string } }; message?: string };
      const message = apiError.response?.data?.detail || apiError.message || 'Erro ao importar arquivo.';
      setImportResult({ message, total: 0, total_rows: 0, created: 0, updated: 0, unchanged: 0, failed: 1, errors: [] });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearImportSelection = () => {
    setSelectedImportFile(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteHoliday = async (id: number) => {
    if (window.confirm('Remover este feriado?')) {
      try { await api.delete(`/holidays/${id}`); fetchData(); } catch { alert('Erro ao excluir feriado.'); }
    }
  };

  const deleteRecess = async (id: number) => {
    if (window.confirm('Remover este recesso?')) {
      try { await api.delete(`/recesses/${id}`); fetchData(); } catch { alert('Erro ao excluir recesso.'); }
    }
  };

  const formatDateInfo = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return { day: d, month: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), full: `${d}/${m}/${y}` };
  };

  const deleteAll = async () => {
    const type = activeTab === 'holidays' ? 'feriados' : 'recessos';
    if (window.confirm(`Apagar TODOS os ${type}? Esta ação não pode ser desfeita.`)) {
      try { await api.delete(`/${activeTab}/all`); fetchData(); } catch { alert(`Erro ao limpar ${type}.`); }
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink tracking-tight">Feriados & Recessos</h2>
        <p className="text-muted mt-1 text-sm">Datas bloqueadas automaticamente na geração de cronogramas.</p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex gap-1 p-1 bg-surface-2 border border-line rounded-xl w-fit">
          {(['holidays', 'recesses'] as const).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === t ? 'bg-accent text-accent-fg' : 'text-muted hover:text-ink'}`}>
              {t === 'holidays' ? 'Feriados' : 'Recessos'}
            </button>
          ))}
        </div>
        <button onClick={deleteAll} className="btn-danger"><Trash2 size={15} /> Limpar base</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-6 space-y-4">
            <h3 className="text-base font-semibold text-ink flex items-center gap-2">
              <Plus size={18} className="text-accent" /> {activeTab === 'holidays' ? 'Novo feriado' : 'Novo recesso'}
            </h3>

            {activeTab === 'holidays' ? (
              <form onSubmit={addHoliday} className="space-y-4">
                <FormGroup label="Data">
                  <input required type="date" className="input-custom" value={holidayForm.date}
                    onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} />
                </FormGroup>
                <FormGroup label="Descrição">
                  <input required type="text" placeholder="Ex: Dia do Professor" className="input-custom" value={holidayForm.description}
                    onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })} />
                </FormGroup>
                <FormGroup label="Tipo">
                  <select className="select-custom" value={holidayForm.type} onChange={(e) => setHolidayForm({ ...holidayForm, type: e.target.value })}>
                    <option value="nacional">Nacional</option>
                    <option value="estadual">Estadual</option>
                    <option value="municipal">Municipal</option>
                    <option value="institucional">Institucional</option>
                  </select>
                </FormGroup>
                <button type="submit" className="btn-primary w-full h-12">Registrar feriado</button>
              </form>
            ) : (
              <form onSubmit={addRecess} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormGroup label="Início">
                    <input required type="date" className="input-custom" value={recessForm.start_date}
                      onChange={(e) => setRecessForm({ ...recessForm, start_date: e.target.value })} />
                  </FormGroup>
                  <FormGroup label="Fim">
                    <input required type="date" className="input-custom" value={recessForm.end_date}
                      onChange={(e) => setRecessForm({ ...recessForm, end_date: e.target.value })} />
                  </FormGroup>
                </div>
                <FormGroup label="Descrição">
                  <input required type="text" placeholder="Ex: Recesso de fim de ano" className="input-custom" value={recessForm.description}
                    onChange={(e) => setRecessForm({ ...recessForm, description: e.target.value })} />
                </FormGroup>
                <button type="submit" className="btn-primary w-full h-12">Registrar recesso</button>
              </form>
            )}
          </div>

          {activeTab === 'holidays' && (
            <div className="card p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0"><UploadIcon size={20} /></div>
                <div>
                  <h4 className="text-ink font-medium text-sm">Importar feriados</h4>
                  <p className="text-xs text-muted mt-0.5">CSV/XLSX com Data, Feriado, Esfera, Tipo. Datas DD/MM usam o ano abaixo.</p>
                </div>
              </div>

              <input ref={fileInputRef} type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleFileSelect} disabled={uploading} />

              <div className="rounded-lg border border-line bg-surface-2 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted"><FileText size={13} /> Modelo esperado</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {['Data', 'Feriado', 'Esfera', 'Tipo'].map((c) => (
                    <span key={c} className="rounded bg-surface px-2 py-1 text-muted border border-line">{c}</span>
                  ))}
                </div>
              </div>

              <FormGroup label="Ano de referência">
                <input type="number" min={1900} max={2200} className="input-custom" value={importYear}
                  onChange={(e) => setImportYear(Number(e.target.value) || new Date().getFullYear())} />
              </FormGroup>

              {selectedImportFile ? (
                <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{selectedImportFile.name}</p>
                    <p className="text-xs text-muted mt-0.5">{(selectedImportFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button type="button" onClick={clearImportSelection} className="p-1.5 rounded text-muted hover:text-ink"><X size={15} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="w-full h-11 rounded-lg border border-dashed border-line text-muted hover:text-ink hover:border-accent/50 transition-colors text-sm font-medium">
                  Selecionar arquivo
                </button>
              )}

              <button type="button" onClick={importSelectedFile} disabled={!selectedImportFile || uploading} className="btn-primary w-full h-11">
                {uploading ? 'Importando...' : 'Importar e atualizar'}
              </button>

              {importResult && (
                <div className={`rounded-lg border p-3 space-y-3 ${importResult.failed > 0 ? 'border-warn/30 bg-warn/5' : 'border-ok/30 bg-ok/5'}`}>
                  <div className="flex items-start gap-2">
                    {importResult.failed > 0 ? <AlertCircle size={17} className="text-warn shrink-0 mt-0.5" /> : <CheckCircle2 size={17} className="text-ok shrink-0 mt-0.5" />}
                    <p className="text-sm text-ink">{importResult.message}</p>
                  </div>
                  {importResult.total_rows > 0 && (
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <ImportStat label="Criados" value={importResult.created} />
                      <ImportStat label="Atual." value={importResult.updated} />
                      <ImportStat label="Iguais" value={importResult.unchanged} />
                      <ImportStat label="Erros" value={importResult.failed} />
                    </div>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                      {importResult.errors.map((err, idx) => (
                        <div key={`${err.row}-${err.field}-${idx}`} className="text-xs text-warn bg-surface-2 border border-warn/20 rounded px-2 py-1.5">
                          Linha {err.row}, {err.field}: {err.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="card p-5">
            <div className="flex items-center gap-2 text-muted mb-2"><Info size={16} /><h4 className="font-medium text-sm text-ink">Importante</h4></div>
            <p className="text-xs text-muted leading-relaxed">
              Feriados e recessos são ignorados automaticamente na geração de cronogramas, conforme a política escolhida.
            </p>
          </div>
        </div>

        <div className="lg:col-span-2">
          {activeTab === 'holidays' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {holidays.length === 0 ? (
                <div className="col-span-full card border-dashed p-12 text-center text-muted text-sm">Nenhum feriado cadastrado.</div>
              ) : (
                [...holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
                  <div key={h.id} className="card p-4 flex items-center justify-between group hover:border-accent/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-surface-2 border border-line flex flex-col items-center justify-center text-accent">
                        <span className="text-[9px] uppercase opacity-70 leading-none">{formatDateInfo(h.date).month}</span>
                        <span className="text-lg font-semibold leading-none mt-0.5">{formatDateInfo(h.date).day}</span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-medium text-ink truncate">{h.description}</h4>
                        <span className="text-xs text-muted capitalize">{h.type} · {h.date.split('-')[0]}</span>
                      </div>
                    </div>
                    <button onClick={() => deleteHoliday(h.id)} className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {recesses.length === 0 ? (
                <div className="card border-dashed p-12 text-center text-muted text-sm">Nenhum recesso cadastrado.</div>
              ) : (
                recesses.map((r) => (
                  <div key={r.id} className="card p-5 flex items-center justify-between group hover:border-accent/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center text-accent"><CalendarRange size={24} /></div>
                      <div>
                        <h4 className="font-medium text-ink">{r.description}</h4>
                        <span className="text-sm text-muted">{formatDateInfo(r.start_date).full} até {formatDateInfo(r.end_date).full}</span>
                      </div>
                    </div>
                    <button onClick={() => deleteRecess(r.id)} className="p-2 text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={18} />
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

const FormGroup = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-muted">{label}</label>
    {children}
  </div>
);

const ImportStat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg bg-surface-2 border border-line px-2 py-2">
    <div className="text-sm font-semibold text-ink">{value}</div>
    <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
  </div>
);

export default HolidayRecessList;
