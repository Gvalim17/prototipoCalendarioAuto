import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import api, { AUTH_EXPIRED_EVENT, getCsrfToken, setCsrfToken } from '../api/client';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

interface AuthSessionResponse extends AuthUser {
  csrf_token: string;
}

interface Credentials {
  email: string;
  password: string;
}

interface Registration extends Credentials {
  name: string;
  privacy_consent: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  login: (credentials: Credentials) => Promise<void>;
  register: (registration: Registration) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    api.get<AuthUser>('/auth/me')
      .then(async (response) => {
        setUser(response.data);
        // Nova aba, recarregamento sem sessionStorage, ou retorno do OAuth do
        // Google: ainda não temos o CSRF token em memória, buscamos um novo.
        if (!getCsrfToken()) {
          const csrfResponse = await api.post<{ csrf_token: string }>('/auth/csrf');
          setCsrfToken(csrfResponse.data.csrf_token);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      setUser((previous) => {
        if (previous) setSessionExpired(true);
        return null;
      });
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpired);
  }, []);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const login = useCallback(async (credentials: Credentials) => {
    const response = await api.post<AuthSessionResponse>('/auth/login', credentials);
    setCsrfToken(response.data.csrf_token);
    setUser(response.data);
    setSessionExpired(false);
  }, []);

  const register = useCallback(async (registration: Registration) => {
    const response = await api.post<AuthSessionResponse>('/auth/register', registration);
    setCsrfToken(response.data.csrf_token);
    setUser(response.data);
    setSessionExpired(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Sessão já pode estar inválida no servidor (ex.: conta acabou de ser
      // excluída, ou sessão expirou em outra aba) — segue para limpar o
      // estado local mesmo assim, o objetivo é sempre terminar deslogado.
    } finally {
      setUser(null);
      setCsrfToken(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpired, clearSessionExpired, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
};
