import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import api, { AUTH_EXPIRED_EVENT } from '../api/client';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
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
      .then((response) => setUser(response.data))
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
    const response = await api.post<AuthUser>('/auth/login', credentials);
    setUser(response.data);
    setSessionExpired(false);
  }, []);

  const register = useCallback(async (registration: Registration) => {
    const response = await api.post<AuthUser>('/auth/register', registration);
    setUser(response.data);
    setSessionExpired(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
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
