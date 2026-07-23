import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarDays, Eye, EyeOff, LockKeyhole, Mail, ShieldAlert, UserRound } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const getErrorMessage = (error: unknown) => {
  const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
  return detail || 'Não foi possível concluir a operação. Tente novamente.';
};

const REMEMBERED_EMAIL_KEY = 'calendario_remembered_email';

const STRENGTH_LABELS = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];
const STRENGTH_COLORS = ['bg-danger', 'bg-danger', 'bg-warn', 'bg-ok', 'bg-ok'];

const passwordScore = (password: string): number => {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
};

const Login = () => {
  const { login, register, sessionExpired, clearSessionExpired } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    api.get<{ available: boolean }>('/auth/google/available')
      .then((response) => setGoogleAvailable(response.data.available))
      .catch(() => setGoogleAvailable(false));
    const rememberedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRememberMe(true);
    }
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname === '/reset-password') {
      setResetToken(params.get('token') || '');
      setMode('reset');
    } else if (params.get('auth_error') === 'google') {
      setError('Não foi possível validar a conta Google. Tente novamente.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const changeMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    clearSessionExpired();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (mode === 'reset' && password !== confirmPassword) {
      setError('As senhas precisam ser iguais.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login({ email, password });
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
      } else if (mode === 'register') {
        await register({ name, email, password, privacy_consent: privacyConsent });
      } else if (mode === 'forgot') {
        const response = await api.post<{ message: string }>('/auth/password-reset/request', { email });
        setNotice(response.data.message);
      } else {
        await api.post('/auth/password-reset/confirm', { token: resetToken, new_password: password });
        window.location.assign('/');
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const startGoogleLogin = () => {
    if (!privacyConsent) {
      setError('Confirme a política de privacidade para continuar com o Google.');
      return;
    }
    const baseUrl = String(api.defaults.baseURL || '').replace(/\/$/, '');
    window.location.assign(`${baseUrl}/auth/google/start?privacy_consent=true`);
  };

  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';
  const title = isRegister ? 'Criar conta' : isForgot ? 'Recuperar senha' : isReset ? 'Definir nova senha' : 'Entrar';
  const subtitle = isForgot
    ? 'Enviaremos um link de uso único para seu e-mail.'
    : isReset ? 'Escolha uma senha nova para continuar.'
    : isRegister ? 'Crie seu acesso para começar a organizar os cronogramas.'
    : 'Use seus dados de acesso para continuar.';
  const strength = passwordScore(password);

  return (
    <main className="min-h-screen bg-bg text-ink flex items-center justify-center p-5">
      <section className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-9">
          <div className="w-11 h-11 rounded-lg bg-accent text-accent-fg flex items-center justify-center"><CalendarDays size={23} /></div>
          <div><h1 className="text-xl font-semibold leading-tight">CronEdu</h1><p className="text-sm text-muted">Gestão de cronogramas</p></div>
        </div>
        <div className="card p-6 sm:p-8">
          {(isForgot || isReset) && <button onClick={() => changeMode('login')} className="text-xs text-muted hover:text-ink flex items-center gap-1 mb-5"><ArrowLeft size={14} /> Voltar para entrar</button>}
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted mt-1">{subtitle}</p>

          {mode === 'login' && sessionExpired && (
            <p role="alert" className="flex items-center gap-2 text-sm text-warn bg-warn/10 border border-warn/20 rounded-lg px-3 py-2 mt-4">
              <ShieldAlert size={16} className="shrink-0" /> Sua sessão expirou. Entre novamente para continuar.
            </p>
          )}

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {isRegister && <label className="block"><span className="text-xs font-medium text-muted">Nome</span><span className="relative block mt-1.5"><UserRound size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input-custom pl-10" required minLength={2} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></span></label>}
            {!isReset && <label className="block"><span className="text-xs font-medium text-muted">E-mail</span><span className="relative block mt-1.5"><Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input-custom pl-10" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></span></label>}
            {!isForgot && (
              <label className="block">
                <span className="text-xs font-medium text-muted">{isReset ? 'Nova senha' : 'Senha'}</span>
                <span className="relative block mt-1.5">
                  <LockKeyhole size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    className="input-custom pl-10 pr-11" type={showPassword ? 'text' : 'password'} required
                    minLength={isRegister || isReset ? 12 : 1}
                    autoComplete={isRegister || isReset ? 'new-password' : 'current-password'}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button" onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
                {(isRegister || isReset) && (
                  <>
                    <span className="block text-xs text-muted mt-1.5">Use ao menos 12 caracteres.</span>
                    {password.length > 0 && (
                      <div className="mt-2">
                        <div className="flex gap-1 h-1">
                          {[0, 1, 2, 3].map((i) => (
                            <span key={i} className={`flex-1 rounded-full ${i < strength ? STRENGTH_COLORS[strength] : 'bg-line'}`} />
                          ))}
                        </div>
                        <span className="text-[11px] text-muted mt-1 block">{STRENGTH_LABELS[strength]}</span>
                      </div>
                    )}
                  </>
                )}
              </label>
            )}
            {isReset && <label className="block"><span className="text-xs font-medium text-muted">Confirmar nova senha</span><input className="input-custom mt-1.5" type={showPassword ? 'text' : 'password'} required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>}
            {mode === 'login' && (
              <label className="flex items-center gap-2.5 text-xs text-muted cursor-pointer">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="accent-[rgb(var(--accent))]" />
                <span>Lembrar meu e-mail neste dispositivo</span>
              </label>
            )}
            {(isRegister || (!isForgot && !isReset && googleAvailable)) && (
              <label className="flex items-start gap-2.5 text-xs text-muted leading-relaxed cursor-pointer">
                <input type="checkbox" required={isRegister} checked={privacyConsent} onChange={(e) => setPrivacyConsent(e.target.checked)} className="mt-0.5 accent-[rgb(var(--accent))]" />
                <span>
                  Li e concordo com os{' '}
                  <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                    Termos de Uso e a Política de Privacidade
                  </a>
                  , incluindo o tratamento dos meus dados para autenticação e gestão da conta.
                </span>
              </label>
            )}
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            {notice && <p role="status" className="text-sm text-ok">{notice}</p>}
            <button className="btn-primary w-full" disabled={submitting} type="submit">{submitting ? 'Aguarde...' : isForgot ? 'Enviar link de recuperação' : isReset ? 'Salvar nova senha' : isRegister ? 'Criar conta' : 'Entrar'}</button>
          </form>

          {!isForgot && !isReset && googleAvailable && <><div className="flex items-center gap-3 my-5 text-xs text-faint"><span className="h-px flex-1 bg-line" />ou<span className="h-px flex-1 bg-line" /></div><button type="button" onClick={startGoogleLogin} className="btn-ghost w-full"><span className="w-5 h-5 rounded-full border border-line bg-surface flex items-center justify-center text-xs font-semibold text-ink">G</span>Continuar com Google</button></>}
          {!isForgot && !isReset && <div className="mt-5 flex flex-col items-start gap-3"><button type="button" className="text-sm text-accent hover:underline" onClick={() => changeMode(isRegister ? 'login' : 'register')}>{isRegister ? 'Já tenho uma conta' : 'Criar uma conta'}</button>{!isRegister && <button type="button" className="text-sm text-accent hover:underline" onClick={() => changeMode('forgot')}>Esqueci minha senha</button>}</div>}
        </div>
      </section>
    </main>
  );
};

export default Login;
