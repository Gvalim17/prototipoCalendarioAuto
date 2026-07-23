import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Download, FileText, Paperclip, Save, Trash2, Upload } from 'lucide-react';
import api from '../api/client';
import type { LessonScript, ScheduleConfigRead, ScheduledClassSummary } from '../types/domain';
import LessonPlanModal from '../components/LessonPlanModal';

const getErrorMessage = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
  return detail || 'Não foi possível concluir a operação.';
};

const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' });
const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

const LessonPlanner = () => {
  const { configId } = useParams<{ configId: string }>();
  const navigate = useNavigate();
  const [config, setConfig] = useState<ScheduleConfigRead | null>(null);
  const [classes, setClasses] = useState<ScheduledClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showPtd, setShowPtd] = useState(false);

  useEffect(() => {
    if (!configId) return;
    Promise.all([
      api.get<ScheduleConfigRead>(`/schedules/${configId}`),
      api.get<ScheduledClassSummary[]>(`/schedules/${configId}/classes`),
    ])
      .then(([cfgRes, classesRes]) => { setConfig(cfgRes.data); setClasses(classesRes.data); })
      .catch((err) => alert(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [configId]);

  if (loading) return <div className="py-20 text-center text-muted text-sm">Carregando planejamento...</div>;
  if (!config) return <div className="py-20 text-center text-danger text-sm">Cronograma não encontrado.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted hover:text-ink transition-colors w-fit text-sm">
        <ArrowLeft size={18} /> Voltar
      </button>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink tracking-tight">Planejar aulas</h2>
          <p className="text-muted mt-1 text-sm">{config.discipline_name} · {config.course_name}</p>
        </div>
        <button onClick={() => setShowPtd(true)} className="btn-ghost">
          <FileText size={17} /> Plano de Trabalho Docente (PTD)
        </button>
      </div>

      {classes.length === 0 ? (
        <div className="card border-dashed py-16 text-center">
          <p className="text-muted text-sm">Nenhuma aula gerada para este cronograma ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {classes.map((lesson) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              expanded={expandedId === lesson.id}
              onToggle={() => setExpandedId(expandedId === lesson.id ? null : lesson.id)}
            />
          ))}
        </div>
      )}

      {showPtd && (
        <LessonPlanModal disciplineId={config.discipline_id} disciplineName={config.discipline_name} onClose={() => setShowPtd(false)} />
      )}
    </div>
  );
};

const LessonRow = ({ lesson, expanded, onToggle }: { lesson: ScheduledClassSummary; expanded: boolean; onToggle: () => void }) => {
  const [script, setScript] = useState<LessonScript | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!expanded || loaded) return;
    api.get<LessonScript>(`/lessons/${lesson.id}/script`)
      .then((res) => setScript(res.data))
      .catch((err) => alert(getErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [expanded, loaded, lesson.id]);

  const save = async () => {
    if (!script) return;
    setSaving(true);
    try {
      const res = await api.put<LessonScript>(`/lessons/${lesson.id}/script`, { topic: script.topic, content: script.content });
      setScript(res.data);
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post<LessonScript>(`/lessons/${lesson.id}/script/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setScript(res.data);
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteAttachment = async (attachmentId: number) => {
    if (!window.confirm('Remover este anexo?')) return;
    try {
      await api.delete(`/lesson-attachments/${attachmentId}`);
      setScript((prev) => prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attachmentId) } : prev);
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const downloadUrl = (attachmentId: number) => {
    const base = String(api.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}/lesson-attachments/${attachmentId}/download`;
  };

  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-4 text-left hover:bg-surface-2/60 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center text-xs font-semibold shrink-0">{lesson.order}</div>
          <div>
            <p className="text-sm font-medium text-ink capitalize">{formatDate(lesson.date)}</p>
            {script?.topic && <p className="text-xs text-muted mt-0.5">{script.topic}</p>}
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
      </button>

      {expanded && (
        <div className="p-4 border-t border-line space-y-4">
          {!loaded ? (
            <p className="text-sm text-muted">Carregando roteiro...</p>
          ) : script ? (
            <>
              <label className="block">
                <span className="text-xs font-medium text-muted">Tema do dia</span>
                <input
                  className="input-custom mt-1.5" placeholder="Ex: Introdução a métricas de qualidade"
                  value={script.topic || ''} onChange={(e) => setScript({ ...script, topic: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted">Roteiro / atividades</span>
                <textarea
                  className="input-custom h-auto py-2.5 mt-1.5 resize-none" rows={5}
                  placeholder="O que será feito nessa aula, passo a passo..."
                  value={script.content || ''} onChange={(e) => setScript({ ...script, content: e.target.value })}
                />
              </label>

              <div>
                <span className="text-xs font-medium text-muted">Materiais anexados</span>
                <div className="mt-2 space-y-2">
                  {script.attachments.map((att) => (
                    <div key={att.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-surface-2 border border-line">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip size={14} className="text-muted shrink-0" />
                        <span className="text-sm text-ink truncate">{att.filename}</span>
                        <span className="text-xs text-faint shrink-0">{formatSize(att.size_bytes)}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={downloadUrl(att.id)} className="p-1.5 text-muted hover:text-accent transition-colors"><Download size={14} /></a>
                        <button onClick={() => deleteAttachment(att.id)} className="p-1.5 text-muted hover:text-danger transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                  {script.attachments.length === 0 && <p className="text-xs text-muted italic">Nenhum material anexado.</p>}
                </div>
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
                <button
                  type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="btn-ghost mt-2 h-9 text-xs"
                >
                  <Upload size={14} /> {uploading ? 'Enviando...' : 'Anexar arquivo (até 5MB)'}
                </button>
              </div>

              <button onClick={() => void save()} disabled={saving} className="btn-primary w-full">
                <Save size={16} /> {saving ? 'Salvando...' : 'Salvar roteiro'}
              </button>
            </>
          ) : (
            <p className="text-sm text-danger">Erro ao carregar roteiro.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default LessonPlanner;
