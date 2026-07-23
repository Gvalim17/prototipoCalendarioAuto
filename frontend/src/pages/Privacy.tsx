import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileText, ShieldCheck, Trash2 } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';

interface PrivacyExport {
  name: string;
  email: string;
  role: string;
  created_at: string;
  last_login_at?: string | null;
  privacy_accepted_at?: string | null;
  privacy_policy_version?: string | null;
  authentication_methods: string[];
}

const getErrorMessage = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
  return detail || 'Não foi possível concluir a operação.';
};

const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '—';

const Privacy = () => {
  const { logout, clearSessionExpired } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<PrivacyExport | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get<PrivacyExport>('/auth/me/export')
      .then((res) => setData(res.data))
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadData = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'meus-dados-calendario-academico.json');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const deleteAccount = async () => {
    const ok = await confirm({
      title: 'Excluir minha conta',
      message: 'Isso apaga permanentemente sua conta e os dados pessoais associados a ela. Cronogramas e cursos cadastrados por você não são apagados, apenas deixam de ter um responsável vinculado. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir minha conta',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await api.delete('/auth/me');
      await logout();
      clearSessionExpired();
    } catch (err) {
      toast.error(getErrorMessage(err));
      setDeleting(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-muted text-sm">Carregando...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink tracking-tight">Privacidade e meus dados</h2>
        <p className="text-muted mt-1 text-sm">
          Gerencie o consentimento, exporte seus dados pessoais ou exclua sua conta, conforme seus
          direitos previstos na LGPD (Lei nº 13.709/2018).
        </p>
      </div>

      <div className="card p-6 space-y-4">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
          <ShieldCheck size={16} className="text-accent" /> Seu consentimento
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted">Conta criada em</dt>
            <dd className="text-ink font-medium">{formatDateTime(data?.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Último acesso</dt>
            <dd className="text-ink font-medium">{formatDateTime(data?.last_login_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Termos aceitos em</dt>
            <dd className="text-ink font-medium">{formatDateTime(data?.privacy_accepted_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Versão da política aceita</dt>
            <dd className="text-ink font-medium">{data?.privacy_policy_version || '—'}</dd>
          </div>
        </dl>
        <Link to="/termos" target="_blank" className="text-sm text-accent hover:underline inline-flex items-center gap-1.5">
          <FileText size={14} /> Ler os Termos de Uso e a Política de Privacidade
        </Link>
      </div>

      <div className="card p-6 space-y-3">
        <h3 className="text-sm font-semibold text-ink">Exportar meus dados</h3>
        <p className="text-sm text-muted">
          Baixe uma cópia dos seus dados pessoais cadastrados no Sistema, em formato JSON (direito de
          acesso e portabilidade, art. 18, incisos II e V, da LGPD).
        </p>
        <button onClick={downloadData} className="btn-ghost w-fit">
          <Download size={16} /> Baixar meus dados
        </button>
      </div>

      <div className="card p-6 space-y-3 border-danger/20">
        <h3 className="text-sm font-semibold text-danger">Excluir minha conta</h3>
        <p className="text-sm text-muted">
          Remove permanentemente sua conta e os dados pessoais associados (nome, e-mail, credenciais de
          acesso). Esta ação não pode ser desfeita.
        </p>
        <button onClick={() => void deleteAccount()} disabled={deleting} className="btn-danger w-fit">
          <Trash2 size={16} /> {deleting ? 'Excluindo...' : 'Excluir minha conta'}
        </button>
      </div>
    </div>
  );
};

export default Privacy;
