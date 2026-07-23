import { useEffect, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import api from '../api/client';
import type { LessonPlan } from '../types/domain';

interface LessonPlanModalProps {
  disciplineId: number;
  disciplineName: string;
  onClose: () => void;
}

const FIELDS: { key: keyof LessonPlan; label: string; placeholder: string }[] = [
  { key: 'ementa', label: 'Ementa', placeholder: 'Resumo do que a disciplina aborda...' },
  { key: 'objetivos', label: 'Objetivos', placeholder: 'O que os alunos devem aprender...' },
  { key: 'conteudo_programatico', label: 'Conteúdo Programático', placeholder: 'Tópicos cobertos, um por linha...' },
  { key: 'metodologia', label: 'Metodologia', placeholder: 'Como as aulas serão conduzidas...' },
  { key: 'recursos_didaticos', label: 'Recursos Didáticos', placeholder: 'Slides, plataformas, ferramentas...' },
  { key: 'criterios_avaliacao', label: 'Critérios de Avaliação', placeholder: 'Como os alunos serão avaliados...' },
  { key: 'bibliografia', label: 'Bibliografia', placeholder: 'Referências, uma por linha...' },
  { key: 'notes', label: 'Observações', placeholder: 'Qualquer outra anotação livre...' },
];

const getErrorMessage = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
  return detail || 'Não foi possível concluir a operação.';
};

const LessonPlanModal = ({ disciplineId, disciplineName, onClose }: LessonPlanModalProps) => {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get<LessonPlan>(`/disciplines/${disciplineId}/lesson-plan`)
      .then((res) => setPlan(res.data))
      .catch((err) => setMessage(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [disciplineId]);

  const save = async () => {
    if (!plan) return;
    setSaving(true);
    setMessage('');
    try {
      const payload = Object.fromEntries(FIELDS.map((f) => [f.key, plan[f.key] ?? null]));
      const res = await api.put<LessonPlan>(`/disciplines/${disciplineId}/lesson-plan`, payload);
      setPlan(res.data);
      setMessage('PTD salvo com sucesso.');
    } catch (err) {
      setMessage(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const exportUrl = (format: 'docx' | 'pdf') => {
    const base = String(api.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}/disciplines/${disciplineId}/lesson-plan/export.${format}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
      <div className="card w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h3 className="text-lg font-semibold text-ink flex items-center gap-2"><FileText size={19} className="text-accent" /> Plano de Trabalho Docente</h3>
            <p className="text-sm text-muted mt-0.5">{disciplineName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted hover:text-ink transition-colors"><X size={20} /></button>
        </div>

        {loading ? (
          <p className="text-sm text-muted py-10 text-center">Carregando...</p>
        ) : plan ? (
          <>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 mt-4 pr-1">
              {FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-xs font-medium text-muted">{f.label}</span>
                  <textarea
                    className="input-custom h-auto py-2.5 mt-1.5 resize-none" rows={f.key === 'notes' ? 4 : 3}
                    placeholder={f.placeholder}
                    value={(plan[f.key] as string) || ''}
                    onChange={(e) => setPlan({ ...plan, [f.key]: e.target.value })}
                  />
                </label>
              ))}
            </div>

            {message && <p className={`text-sm mt-3 ${message.includes('sucesso') ? 'text-ok' : 'text-danger'}`}>{message}</p>}

            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-line">
              <button onClick={() => void save()} disabled={saving} className="btn-primary flex-1 min-w-[140px]">
                {saving ? 'Salvando...' : 'Salvar PTD'}
              </button>
              <a href={exportUrl('docx')} className="btn-ghost"><Download size={16} /> Word</a>
              <a href={exportUrl('pdf')} className="btn-ghost"><Download size={16} /> PDF</a>
            </div>
          </>
        ) : (
          <p className="text-sm text-danger py-10 text-center">{message}</p>
        )}
      </div>
    </div>
  );
};

export default LessonPlanModal;
