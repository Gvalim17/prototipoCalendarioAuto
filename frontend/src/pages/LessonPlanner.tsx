import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import api from '../api/client';
import type { ScheduleConfigRead, ScheduledClassSummary } from '../types/domain';
import LessonPlanModal from '../components/LessonPlanModal';
import LessonCard from '../components/LessonCard';
import { useToast } from '../contexts/ToastContext';

const getErrorMessage = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
  return detail || 'Não foi possível concluir a operação.';
};

const LessonPlanner = () => {
  const { configId } = useParams<{ configId: string }>();
  const navigate = useNavigate();
  const [config, setConfig] = useState<ScheduleConfigRead | null>(null);
  const [classes, setClasses] = useState<ScheduledClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showPtd, setShowPtd] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!configId) return;
    Promise.all([
      api.get<ScheduleConfigRead>(`/schedules/${configId}`),
      api.get<ScheduledClassSummary[]>(`/schedules/${configId}/classes`),
    ])
      .then(([cfgRes, classesRes]) => { setConfig(cfgRes.data); setClasses(classesRes.data); })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              configId={Number(configId)}
              startTime={config.start_time}
              endTime={config.end_time}
              expanded={expandedId === lesson.id}
              onToggle={() => setExpandedId(expandedId === lesson.id ? null : lesson.id)}
              onDateChanged={(classId, newDate, status, reason) => setClasses((prev) => prev.map((c) => c.id === classId ? { ...c, date: newDate, status, change_reason: reason } : c))}
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

export default LessonPlanner;
