import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, Building2, CalendarCheck, Clock } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../contexts/ToastContext';
import { formatHours } from '../utils/format';
import type { Reports as ReportsData } from '../types/domain';

const getErrorMessage = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
  return detail || 'Não foi possível carregar os relatórios.';
};

const Reports = () => {
  const toast = useToast();
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ReportsData>('/reports/')
      .then((res) => setData(res.data))
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="py-20 text-center text-muted text-sm">Carregando relatórios...</div>;
  if (!data) return <div className="py-20 text-center text-danger text-sm">Não foi possível carregar os relatórios.</div>;

  const modalityTotal = data.by_modality.presencial + data.by_modality.remoto;
  const presencialPct = modalityTotal > 0 ? Math.round((data.by_modality.presencial / modalityTotal) * 100) : 0;
  const remotoPct = modalityTotal > 0 ? 100 - presencialPct : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink tracking-tight">Relatórios</h2>
        <p className="text-muted mt-1 text-sm">Panorama das suas aulas: carga horária, disciplinas e instituições mais lecionadas.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatTile icon={<CalendarCheck size={20} />} label="Aulas lecionadas" value={String(data.total_classes)} />
        <StatTile icon={<Clock size={20} />} label="Carga horária total" value={data.total_classes > 0 ? formatHours(data.total_hours) : '—'} />
      </div>

      <div className="card p-6">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-2 mb-4">
          <BarChart3 size={16} className="text-accent" /> Modalidade
        </h3>
        {modalityTotal === 0 ? (
          <p className="text-sm text-muted">Nenhuma aula registrada ainda.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex h-3 rounded-full overflow-hidden bg-surface-2">
              {presencialPct > 0 && <div className="bg-ok" style={{ width: `${presencialPct}%` }} />}
              {remotoPct > 0 && <div className="bg-accent" style={{ width: `${remotoPct}%` }} />}
            </div>
            <div className="flex items-center gap-6 text-sm">
              <span className="flex items-center gap-1.5 text-ink"><span className="w-2.5 h-2.5 rounded-full bg-ok" /> Presencial — {data.by_modality.presencial} ({presencialPct}%)</span>
              <span className="flex items-center gap-1.5 text-ink"><span className="w-2.5 h-2.5 rounded-full bg-accent" /> Remoto — {data.by_modality.remoto} ({remotoPct}%)</span>
            </div>
          </div>
        )}
      </div>

      <BreakdownCard
        icon={<BookOpen size={16} className="text-accent" />}
        title="Disciplinas mais lecionadas"
        items={data.by_discipline}
        emptyLabel="Nenhuma disciplina lecionada ainda."
      />

      <BreakdownCard
        icon={<Building2 size={16} className="text-accent" />}
        title="Instituições mais lecionadas"
        items={data.by_institution}
        emptyLabel="Nenhuma instituição registrada ainda."
      />
    </div>
  );
};

const StatTile = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="card p-5">
    <div className="w-10 h-10 rounded-lg bg-accent text-accent-fg flex items-center justify-center mb-3">{icon}</div>
    <p className="text-3xl font-semibold text-ink tracking-tight">{value}</p>
    <p className="text-xs text-muted mt-0.5">{label}</p>
  </div>
);

interface BreakdownCardProps {
  icon: React.ReactNode;
  title: string;
  items: { label: string; classes: number; hours: number }[];
  emptyLabel: string;
}

const BreakdownCard = ({ icon, title, items, emptyLabel }: BreakdownCardProps) => {
  const max = Math.max(1, ...items.map((i) => i.classes));
  return (
    <div className="card p-6">
      <h3 className="text-sm font-semibold text-ink flex items-center gap-2 mb-4">{icon} {title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-ink font-medium truncate">{item.label}</span>
                <span className="text-muted text-xs shrink-0 ml-3">{item.classes} {item.classes === 1 ? 'aula' : 'aulas'} · {formatHours(item.hours)}</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-accent rounded-full" style={{ width: `${Math.max(4, (item.classes / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Reports;
