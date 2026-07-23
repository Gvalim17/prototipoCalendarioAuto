import { useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Info, RefreshCw, Pause, Play } from 'lucide-react';
import api from '../api/client';
import type { LogEntry } from '../types/domain';

const LEVELS = ['ALL', 'INFO', 'WARNING', 'ERROR'] as const;
type LevelFilter = (typeof LEVELS)[number];

const Logs = () => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<LevelFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = async () => {
    try {
      const params: Record<string, string | number> = { limit: 300 };
      if (level !== 'ALL') params.level = level;
      const res = await api.get<LogEntry[]>(`/logs/`, { params });
      setEntries(res.data);
      setError(null);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(detail || 'Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, level]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink tracking-tight">Logs do sistema</h2>
          <p className="text-muted mt-1 text-sm">Requisições HTTP e eventos recentes do backend.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 bg-surface-2 border border-line rounded-xl">
            {LEVELS.map((l) => (
              <button key={l} onClick={() => setLevel(l)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${level === l ? 'bg-accent text-accent-fg' : 'text-muted hover:text-ink'}`}>
                {l === 'ALL' ? 'Todos' : l}
              </button>
            ))}
          </div>
          <button onClick={() => setAutoRefresh((a) => !a)} className="btn-ghost h-9 px-3 text-xs">
            {autoRefresh ? <Pause size={14} /> : <Play size={14} />} {autoRefresh ? 'Pausar' : 'Retomar'}
          </button>
          <button onClick={fetchLogs} className="btn-ghost h-9 px-3 text-xs"><RefreshCw size={14} /> Atualizar</button>
        </div>
      </div>

      {error && (
        <div className="card p-4 border-danger/30 bg-danger/5 text-sm text-danger">{error}</div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted text-sm">Carregando logs...</div>
        ) : entries.length === 0 ? (
          <div className="py-16 text-center text-muted text-sm">Nenhum registro encontrado.</div>
        ) : (
          <div className="divide-y divide-line max-h-[70vh] overflow-y-auto custom-scrollbar">
            {entries.map((e, i) => <LogRow key={i} entry={e} />)}
          </div>
        )}
      </div>
    </div>
  );
};

const LEVEL_STYLES: Record<string, { icon: typeof Info; text: string; bg: string }> = {
  INFO: { icon: Info, text: 'text-accent', bg: 'bg-accent/10' },
  WARNING: { icon: AlertTriangle, text: 'text-warn', bg: 'bg-warn/10' },
  ERROR: { icon: AlertCircle, text: 'text-danger', bg: 'bg-danger/10' },
};

const LogRow = ({ entry }: { entry: LogEntry }) => {
  const style = LEVEL_STYLES[entry.level] || LEVEL_STYLES.INFO;
  const Icon = style.icon;
  const time = entry.time.replace('T', ' ');

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2/60 transition-colors">
      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${style.bg} ${style.text}`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-muted">{time}</span>
          {entry.status_code != null && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${entry.status_code >= 400 ? 'bg-danger/10 text-danger' : 'bg-ok/10 text-ok'}`}>
              {entry.method} {entry.status_code}
            </span>
          )}
          {entry.duration_ms != null && <span className="text-[10px] text-faint">{entry.duration_ms}ms</span>}
          {entry.event && <span className="text-[10px] text-muted bg-surface-2 px-1.5 py-0.5 rounded">{entry.event}</span>}
        </div>
        <p className="text-sm text-ink mt-0.5 break-words">{entry.message}</p>
        {(entry.path || entry.request_id || entry.actor_id != null || entry.outcome) && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10px] text-faint font-mono">
            {entry.path && <span>{entry.path}</span>}
            {entry.outcome && <span>resultado: {entry.outcome}</span>}
            {entry.actor_id != null && <span>usuário: #{entry.actor_id}</span>}
            {entry.request_id && <span title="Identificador da requisição">req: {entry.request_id.slice(0, 12)}</span>}
          </div>
        )}
        {entry.exception && (
          <pre className="text-[10px] text-danger/80 bg-danger/5 border border-danger/20 rounded-lg p-2 mt-2 overflow-x-auto whitespace-pre-wrap">{entry.exception}</pre>
        )}
      </div>
    </div>
  );
};

export default Logs;
