import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  ChevronDown, ChevronUp, Copy, Download, FileText, Link2, Mail, Paperclip, Pencil, Save, Trash2, Upload, X,
} from 'lucide-react';
import api from '../api/client';
import type { LessonScript, ScheduleConflictCheckResponse, SendLessonEmailResult, ShareLinkCreated, ShareLinkStatus } from '../types/domain';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

const getErrorMessage = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
  return detail || 'Não foi possível concluir a operação.';
};

const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' });
const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;
const formatExpiry = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export interface LessonCardLesson {
  id: number;
  date: string;
  order: number;
  status: 'scheduled' | 'cancelled';
  change_reason?: string | null;
}

interface LessonCardProps {
  lesson: LessonCardLesson;
  configId: number;
  startTime?: string | null;
  endTime?: string | null;
  expanded: boolean;
  onToggle: () => void;
  onDateChanged: (classId: number, newDate: string, status: 'scheduled' | 'cancelled', reason: string) => void;
  subtitle?: ReactNode;
}

const LessonCard = ({ lesson, configId, startTime, endTime, expanded, onToggle, onDateChanged, subtitle }: LessonCardProps) => {
  const [script, setScript] = useState<LessonScript | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [newDate, setNewDate] = useState(lesson.date);
  const [cancelClass, setCancelClass] = useState(false);
  const [reason, setReason] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const [shareStatus, setShareStatus] = useState<ShareLinkStatus | null>(null);
  const [createdShareLink, setCreatedShareLink] = useState<ShareLinkCreated | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailResult, setEmailResult] = useState<SendLessonEmailResult | null>(null);

  useEffect(() => {
    if (!expanded || loaded) return;
    Promise.all([
      api.get<LessonScript>(`/lessons/${lesson.id}/script`),
      api.get<ShareLinkStatus>(`/lessons/${lesson.id}/share-link`),
    ])
      .then(([scriptRes, shareRes]) => { setScript(scriptRes.data); setShareStatus(shareRes.data); })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoaded(true));
  }, [expanded, loaded, lesson.id]);

  const save = async () => {
    if (!script) return;
    setSaving(true);
    try {
      const res = await api.put<LessonScript>(`/lessons/${lesson.id}/script`, { topic: script.topic, content: script.content });
      setScript(res.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
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
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteAttachment = async (attachmentId: number) => {
    const ok = await confirm({ message: 'Remover este anexo?', confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    try {
      await api.delete(`/lesson-attachments/${attachmentId}`);
      setScript((prev) => prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attachmentId) } : prev);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const confirmDateChange = async () => {
    if (newDate === lesson.date && !cancelClass && lesson.status !== 'cancelled') { setEditingDate(false); return; }
    if (reason.trim().length < 3) {
      toast.error('Informe o motivo da alteração (mínimo 3 caracteres).');
      return;
    }
    setSavingDate(true);
    try {
      if (!cancelClass && startTime && endTime) {
        const conflictRes = await api.post<ScheduleConflictCheckResponse>('/schedules/check-conflicts', {
          dates: [newDate], start_time: startTime, end_time: endTime, exclude_config_id: configId,
        });
        const { overlaps, near } = conflictRes.data;
        if (overlaps.length > 0 || near.length > 0) {
          const summary = [...overlaps, ...near]
            .map((c) => `${c.discipline_name} (${c.course_name}) às ${c.start_time?.slice(0, 5)}–${c.end_time?.slice(0, 5)}`)
            .join('\n');
          const proceed = await confirm({
            title: 'Conflito de horário',
            message: `Você já tem outra aula nesse dia:\n${summary}\n\nDeseja mudar a data mesmo assim?`,
            confirmLabel: 'Mudar mesmo assim',
          });
          if (!proceed) { setSavingDate(false); return; }
        }
      }
      await api.patch(`/schedules/${configId}/classes/${lesson.id}`, {
        date: newDate, reason: reason.trim(), cancelled: cancelClass,
      });
      onDateChanged(lesson.id, newDate, cancelClass ? 'cancelled' : 'scheduled', reason.trim());
      setEditingDate(false);
      setReason('');
      setCancelClass(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingDate(false);
    }
  };

  const downloadUrl = (attachmentId: number) => {
    const base = String(api.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}/lesson-attachments/${attachmentId}/download`;
  };

  const scriptExportUrl = (format: 'docx' | 'pdf') => {
    const base = String(api.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}/lessons/${lesson.id}/script/export.${format}`;
  };

  const createShareLink = async () => {
    setShareBusy(true);
    try {
      const res = await api.post<ShareLinkCreated>(`/lessons/${lesson.id}/share-link`);
      setCreatedShareLink(res.data);
      setShareStatus(res.data);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setShareBusy(false);
    }
  };

  const revokeShareLink = async () => {
    const ok = await confirm({ message: 'Revogar o link de compartilhamento? Quem tiver o link perderá o acesso.', confirmLabel: 'Revogar', danger: true });
    if (!ok) return;
    setShareBusy(true);
    try {
      await api.delete(`/lessons/${lesson.id}/share-link`);
      setShareStatus({ active: false });
      setCreatedShareLink(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url.startsWith('http') ? url : `${window.location.origin}${url}`);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  const sendEmail = async () => {
    const recipients = emailRecipients.split(/[,;\n]/).map((r) => r.trim()).filter(Boolean);
    if (recipients.length === 0) {
      toast.error('Informe ao menos um e-mail de destino.');
      return;
    }
    const ok = await confirm({
      title: 'Enviar material por e-mail',
      message: `Enviar o roteiro e os anexos desta aula para ${recipients.length === 1 ? recipients[0] : `${recipients.length} destinatários`}?`,
      confirmLabel: 'Enviar',
    });
    if (!ok) return;
    setSendingEmail(true);
    setEmailResult(null);
    try {
      const res = await api.post<SendLessonEmailResult>(`/lessons/${lesson.id}/send-email`, {
        recipients, message: emailMessage.trim() || undefined,
      });
      setEmailResult(res.data);
      if (res.data.failed.length === 0) toast.success('Material enviado por e-mail.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="w-full flex items-center justify-between p-4 hover:bg-surface-2/60 transition-colors">
        <button onClick={onToggle} className="flex items-center gap-3 text-left flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center text-xs font-semibold shrink-0">{lesson.order}</div>
          <div className="min-w-0">
            {editingDate ? (
              <div className="flex flex-col gap-2 py-1" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date" value={newDate} disabled={cancelClass}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="input-custom h-8 py-0 text-sm w-auto disabled:opacity-50"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <input type="checkbox" checked={cancelClass} onChange={(e) => setCancelClass(e.target.checked)} />
                    Cancelar esta aula (sem reposição)
                  </label>
                </div>
                <input
                  type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Motivo da alteração (obrigatório)"
                  className="input-custom h-8 py-0 text-sm"
                />
                <span className="flex items-center gap-3">
                  <button onClick={() => void confirmDateChange()} disabled={savingDate} className="text-xs text-accent font-medium hover:underline">
                    {savingDate ? 'Salvando...' : 'Confirmar'}
                  </button>
                  <button
                    onClick={() => { setEditingDate(false); setNewDate(lesson.date); setCancelClass(false); setReason(''); }}
                    disabled={savingDate} className="text-xs text-muted hover:underline"
                  >
                    Descartar
                  </button>
                </span>
              </div>
            ) : (
              <>
                <p className={`text-sm font-medium capitalize ${lesson.status === 'cancelled' ? 'text-muted line-through' : 'text-ink'}`}>
                  {formatDate(lesson.date)}
                  {lesson.status === 'cancelled' && <span className="ml-2 text-xs font-normal no-underline text-danger">Cancelada</span>}
                </p>
                {lesson.change_reason && <p className="text-xs text-muted mt-0.5">Motivo: {lesson.change_reason}</p>}
              </>
            )}
            {subtitle}
            {script?.topic && <p className="text-xs text-muted mt-0.5">{script.topic}</p>}
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          {!editingDate && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditingDate(true); setNewDate(lesson.date); }}
              title="Editar ou cancelar esta aula"
              className="p-2 text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
            >
              <Pencil size={15} />
            </button>
          )}
          <button onClick={onToggle} className="p-2 text-muted">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

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

              <div className="pt-3 border-t border-line space-y-3">
                <span className="text-xs font-medium text-muted">Compartilhar e exportar</span>

                <div className="flex flex-wrap gap-2">
                  <a href={scriptExportUrl('pdf')} className="btn-ghost h-9 text-xs"><FileText size={14} /> Exportar PDF</a>
                  <a href={scriptExportUrl('docx')} className="btn-ghost h-9 text-xs"><FileText size={14} /> Exportar Word</a>
                  <button
                    type="button" onClick={() => setShowEmailForm((v) => !v)}
                    className="btn-ghost h-9 text-xs"
                  >
                    <Mail size={14} /> Enviar por e-mail
                  </button>
                </div>

                {showEmailForm && (
                  <div className="p-3 rounded-lg bg-surface-2 border border-line space-y-2">
                    <label className="block">
                      <span className="text-xs font-medium text-muted">E-mails de destino (separados por vírgula)</span>
                      <input
                        className="input-custom mt-1.5 text-sm" placeholder="aluno1@email.com, aluno2@email.com"
                        value={emailRecipients} onChange={(e) => setEmailRecipients(e.target.value)}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-muted">Mensagem (opcional)</span>
                      <textarea
                        className="input-custom h-auto py-2 mt-1.5 resize-none text-sm" rows={2}
                        value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)}
                      />
                    </label>
                    <div className="flex items-center gap-3">
                      <button onClick={() => void sendEmail()} disabled={sendingEmail} className="btn-primary h-9 text-xs">
                        <Mail size={14} /> {sendingEmail ? 'Enviando...' : 'Enviar'}
                      </button>
                      <button onClick={() => { setShowEmailForm(false); setEmailResult(null); }} className="text-xs text-muted hover:underline">
                        Fechar
                      </button>
                    </div>
                    {emailResult && (
                      <p className={`text-xs ${emailResult.failed.length === 0 ? 'text-ok' : 'text-danger'}`}>
                        {emailResult.sent} enviado(s){emailResult.failed.length > 0 && ` · falhou para: ${emailResult.failed.join(', ')}`}
                      </p>
                    )}
                  </div>
                )}

                <div className="p-3 rounded-lg bg-surface-2 border border-line space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-ink">
                    <Link2 size={14} className="text-accent" /> Link público de materiais
                  </div>
                  <p className="text-[11px] text-muted">
                    Qualquer pessoa com o link acessa os anexos, sem login. Evite anexar arquivos com dados pessoais de terceiros (notas, CPF, e-mail de aluno) neste roteiro.
                  </p>
                  {createdShareLink ? (
                    <>
                      <div className="flex items-center gap-2">
                        <input readOnly value={createdShareLink.url || ''} className="input-custom h-8 py-0 text-xs flex-1" />
                        <button onClick={() => void copyShareLink(createdShareLink.url || '')} className="p-2 text-muted hover:text-accent transition-colors" title="Copiar link">
                          <Copy size={14} />
                        </button>
                      </div>
                      <p className="text-[11px] text-muted">Expira em {formatExpiry(createdShareLink.expires_at || '')}. Guarde este link — ele não será exibido novamente.</p>
                    </>
                  ) : shareStatus?.active ? (
                    <p className="text-xs text-muted">Link ativo, expira em {formatExpiry(shareStatus.expires_at || '')}. Por segurança, o endereço só é exibido no momento da criação — revogue e gere um novo se precisar reenviar.</p>
                  ) : (
                    <p className="text-xs text-muted italic">Nenhum link ativo. Gere um para dar acesso aos anexos sem exigir login (válido por 7 dias).</p>
                  )}
                  <div className="flex items-center gap-3">
                    <button onClick={() => void createShareLink()} disabled={shareBusy} className="text-xs text-accent font-medium hover:underline">
                      {shareBusy ? 'Aguarde...' : shareStatus?.active ? 'Gerar novo link' : 'Gerar link'}
                    </button>
                    {shareStatus?.active && (
                      <button onClick={() => void revokeShareLink()} disabled={shareBusy} className="text-xs text-danger hover:underline flex items-center gap-1">
                        <X size={12} /> Revogar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-danger">Erro ao carregar roteiro.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default LessonCard;
