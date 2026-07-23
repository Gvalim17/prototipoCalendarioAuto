import { useEffect, useState, type FormEvent } from 'react';
import { Mail, Shield, Trash2, UserPlus, UserRound } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'professor' | string;
  created_at: string;
  last_login_at?: string | null;
}

const getErrorMessage = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
  return detail || 'Não foi possível concluir a operação.';
};

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';

const Users = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'professor'>('professor');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchUsers = async () => {
    try {
      const response = await api.get<ManagedUser[]>('/users/');
      setUsers(response.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      await api.post('/users/', { name, email, role });
      setNotice(`Convite enviado para ${email}.`);
      setName('');
      setEmail('');
      setRole('professor');
      setShowInvite(false);
      fetchUsers();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const changeRole = async (target: ManagedUser, nextRole: 'admin' | 'professor') => {
    setError('');
    try {
      await api.patch(`/users/${target.id}/role`, { role: nextRole });
      fetchUsers();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const removeUser = async (target: ManagedUser) => {
    if (!window.confirm(`Remover o acesso de ${target.name}? Esta ação não pode ser desfeita.`)) return;
    setError('');
    try {
      await api.delete(`/users/${target.id}`);
      fetchUsers();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink tracking-tight">Usuários</h2>
          <p className="text-muted mt-1 text-sm">Convide professores e administre quem tem acesso ao sistema.</p>
        </div>
        <button className="btn-primary" onClick={() => { setShowInvite((v) => !v); setError(''); setNotice(''); }}>
          <UserPlus size={18} /> Convidar usuário
        </button>
      </div>

      {notice && <p role="status" className="text-sm text-ok">{notice}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {showInvite && (
        <form onSubmit={invite} className="card p-5 sm:p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-muted">Nome</span>
              <span className="relative block mt-1.5">
                <UserRound size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input className="input-custom pl-10" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted">E-mail</span>
              <span className="relative block mt-1.5">
                <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input className="input-custom pl-10" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </span>
            </label>
          </div>
          <label className="block max-w-xs">
            <span className="text-xs font-medium text-muted">Papel</span>
            <select className="input-custom mt-1.5" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'professor')}>
              <option value="professor">Professor</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <p className="text-xs text-muted">Enviaremos um e-mail com um link, válido por 20 minutos, para a pessoa definir a própria senha.</p>
          <div className="flex gap-3">
            <button className="btn-primary" disabled={submitting} type="submit">{submitting ? 'Enviando...' : 'Enviar convite'}</button>
            <button className="btn-ghost" type="button" onClick={() => setShowInvite(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-muted">Carregando usuários...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted uppercase tracking-wide">
                <th className="p-4 font-medium">Nome</th>
                <th className="p-4 font-medium">E-mail</th>
                <th className="p-4 font-medium">Papel</th>
                <th className="p-4 font-medium">Criado em</th>
                <th className="p-4 font-medium">Último acesso</th>
                <th className="p-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0">
                  <td className="p-4 text-ink">{u.name}{u.id === currentUser?.id && <span className="ml-2 text-xs text-muted">(você)</span>}</td>
                  <td className="p-4 text-muted">{u.email}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md ${u.role === 'admin' ? 'bg-accent/10 text-accent' : 'bg-surface-2 text-muted'}`}>
                      <Shield size={13} /> {u.role === 'admin' ? 'Administrador' : 'Professor'}
                    </span>
                  </td>
                  <td className="p-4 text-muted">{formatDate(u.created_at)}</td>
                  <td className="p-4 text-muted">{formatDate(u.last_login_at)}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        className="text-xs text-accent hover:underline"
                        onClick={() => changeRole(u, u.role === 'admin' ? 'professor' : 'admin')}
                      >
                        {u.role === 'admin' ? 'Tornar professor' : 'Tornar admin'}
                      </button>
                      {u.id !== currentUser?.id && (
                        <button className="p-1.5 text-muted hover:text-danger transition-colors" title="Remover acesso" onClick={() => removeUser(u)}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Users;
