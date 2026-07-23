import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarPlus, CheckCheck, Copy, Link2, Mail, RefreshCw, Save } from 'lucide-react';
import api from '../api/client';
import type { AlertNotification, AlertPreference, CalendarTokenInfo } from '../types/domain';

const OFFSETS = [
  { value: 4320, label: '3 dias antes' },
  { value: 1440, label: '1 dia antes' },
  { value: 120, label: '2 horas antes' },
  { value: 60, label: '1 hora antes' },
  { value: 30, label: '30 min antes' },
];

const Alerts = () => {
  const [preferences, setPreferences] = useState<AlertPreference | null>(null);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [tokenInfo, setTokenInfo] = useState<CalendarTokenInfo | null>(null);
  const [subscribeUrl, setSubscribeUrl] = useState('');
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchData = async () => {
    const [pref, items, token] = await Promise.all([
      api.get<AlertPreference>('/alerts/preferences'),
      api.get<AlertNotification[]>('/alerts/notifications', { params: { limit: 50 } }),
      api.get<CalendarTokenInfo>('/alerts/calendar-token'),
    ]);
    setPreferences(pref.data);
    setNotifications(items.data);
    setTokenInfo(token.data);
  };

  useEffect(() => { void fetchData().catch(() => setMessage('Não foi possível carregar os alertas.')); }, []);

  const selectedOffsets = useMemo(() => new Set(preferences?.minutes_before || []), [preferences]);
  const toggleOffset = (value: number) => {
    if (!preferences) return;
    const next = new Set(preferences.minutes_before);
    if (next.has(value)) next.delete(value); else next.add(value);
    if (next.size === 0) return;
    setPreferences({ ...preferences, minutes_before: [...next].sort((a, b) => b - a) });
  };

  const save = async () => {
    if (!preferences) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await api.put<AlertPreference>('/alerts/preferences', {
        enabled: preferences.enabled,
        minutes_before: preferences.minutes_before,
        in_app_enabled: preferences.in_app_enabled,
        email_enabled: preferences.email_enabled,
        timezone: preferences.timezone,
      });
      setPreferences(response.data);
      setMessage('Preferências de alertas atualizadas.');
    } catch {
      setMessage('Não foi possível salvar as preferências.');
    } finally {
      setSaving(false);
    }
  };

  const markRead = async (id: number) => {
    await api.post(`/alerts/notifications/${id}/read`);
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  };

  const rotateToken = async () => {
    if (tokenInfo?.has_token && !window.confirm('Gerar um novo link invalida o link atual — quem já assinou vai parar de receber atualizações até colar o novo. Continuar?')) return;
    setRotating(true);
    try {
      const res = await api.post<{ token: string; path: string }>('/alerts/calendar-token/rotate');
      const base = String(api.defaults.baseURL || '').replace(/\/$/, '');
      setSubscribeUrl(`${base}${res.data.path}`);
      setTokenInfo({ has_token: true });
    } catch {
      setMessage('Não foi possível gerar o link de assinatura.');
    } finally {
      setRotating(false);
    }
  };

  const copyUrl = async () => {
    if (!subscribeUrl) return;
    await navigator.clipboard.writeText(subscribeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!preferences) return <div className="py-20 text-center text-muted text-sm">Carregando alertas...</div>;
  const calendarUrl = `${String(api.defaults.baseURL || '').replace(/\/$/, '')}/alerts/calendar.ics`;

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div><h2 className="text-2xl font-semibold text-ink">Alertas de aula</h2><p className="text-sm text-muted mt-1">Lembretes pessoais para as aulas dos seus cronogramas.</p></div>
        <a href={calendarUrl} className="btn-ghost" title="Baixar arquivo .ics para importar uma vez"><CalendarPlus size={17} /> Baixar .ics</a>
      </div>

      <section className="card p-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0"><Link2 size={19} /></div>
          <div className="flex-1">
            <h3 className="font-semibold text-ink">Assinar no Google Agenda / Outlook / Apple Calendar</h3>
            <p className="text-sm text-muted mt-1">
              Gere um link pessoal e cole em <strong>"Outras agendas &gt; Assinar por URL"</strong> (Google Agenda) ou equivalente.
              O calendário se atualiza sozinho, sem precisar exportar de novo.
            </p>

            {subscribeUrl ? (
              <div className="mt-4 space-y-2">
                <div className="flex gap-2">
                  <input readOnly value={subscribeUrl} className="input-custom font-mono text-xs flex-1" onFocus={(e) => e.target.select()} />
                  <button onClick={() => void copyUrl()} className="btn-ghost shrink-0"><Copy size={15} /> {copied ? 'Copiado!' : 'Copiar'}</button>
                </div>
                <p className="text-xs text-warn">Esse link só aparece uma vez aqui — guarde-o. Se perder, gere um novo.</p>
              </div>
            ) : (
              <button onClick={() => void rotateToken()} disabled={rotating} className="btn-primary mt-4">
                <RefreshCw size={16} /> {rotating ? 'Gerando...' : tokenInfo?.has_token ? 'Gerar novo link' : 'Gerar link de assinatura'}
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid lg:grid-cols-[1fr_1.15fr] gap-6">
        <div className="card p-6">
          <div className="flex items-start justify-between gap-4"><div><h3 className="font-semibold text-ink">Regras de aviso</h3><p className="text-sm text-muted mt-1">Escolha quando deseja ser avisado antes de cada aula.</p></div><label className="relative inline-flex cursor-pointer items-center"><input type="checkbox" className="sr-only peer" checked={preferences.enabled} onChange={(e) => setPreferences({ ...preferences, enabled: e.target.checked })} /><span className="w-10 h-6 bg-line rounded-full peer-checked:bg-accent transition-colors" /><span className="absolute left-1 w-4 h-4 bg-surface rounded-full transition-transform peer-checked:translate-x-4" /></label></div>
          <div className="mt-6 space-y-2">
            {OFFSETS.map((offset) => <label key={offset.value} className="flex items-center gap-3 py-2 text-sm text-ink cursor-pointer"><input type="checkbox" checked={selectedOffsets.has(offset.value)} onChange={() => toggleOffset(offset.value)} className="w-4 h-4 accent-[rgb(var(--accent))]" /><span>{offset.label}</span></label>)}
          </div>
          <div className="border-t border-line mt-5 pt-5 space-y-3">
            <label className="flex items-center gap-3 text-sm text-ink cursor-pointer"><input type="checkbox" checked={preferences.in_app_enabled} onChange={(e) => setPreferences({ ...preferences, in_app_enabled: e.target.checked })} className="w-4 h-4 accent-[rgb(var(--accent))]" /><Bell size={16} className="text-muted" /> Aviso no sistema</label>
            <label className="flex items-center gap-3 text-sm text-ink cursor-pointer"><input type="checkbox" checked={preferences.email_enabled} onChange={(e) => setPreferences({ ...preferences, email_enabled: e.target.checked })} className="w-4 h-4 accent-[rgb(var(--accent))]" /><Mail size={16} className="text-muted" /> Enviar também por e-mail</label>
          </div>
          {message && <p className={`text-sm mt-4 ${message.includes('atualizadas') ? 'text-ok' : 'text-danger'}`}>{message}</p>}
          <button onClick={() => void save()} disabled={saving} className="btn-primary mt-5 w-full"><Save size={17} /> {saving ? 'Salvando...' : 'Salvar preferências'}</button>
        </div>

        <div className="card overflow-hidden">
          <div className="p-6 border-b border-line"><h3 className="font-semibold text-ink">Notificações recentes</h3></div>
          <div className="divide-y divide-line max-h-[31rem] overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? <div className="py-16 text-center text-sm text-muted">Nenhum alerta enviado ainda.</div> : notifications.map((notification) => <div key={notification.id} className={`p-5 ${notification.read_at ? 'opacity-60' : 'bg-accent/5'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-sm text-ink">{notification.title}</p><p className="text-sm text-muted whitespace-pre-line mt-1">{notification.body}</p><p className="text-xs text-faint mt-2">Programado para {new Date(notification.scheduled_for).toLocaleString('pt-BR')}</p></div>{!notification.read_at && <button onClick={() => void markRead(notification.id)} title="Marcar como lido" className="p-2 text-muted hover:text-accent hover:bg-accent/10 rounded-lg"><CheckCheck size={17} /></button>}</div></div>)}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Alerts;
