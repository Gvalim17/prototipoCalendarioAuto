import axios from 'axios';

export const AUTH_EXPIRED_EVENT = 'auth:expired';

const CSRF_STORAGE_KEY = 'csrf_token';

// Backend (Render) e frontend (Vercel) ficam em domínios diferentes em produção,
// então o JS aqui não consegue ler o cookie calendario_csrf setado pelo backend
// (cookies são escopados por domínio). Por isso o token é entregue no corpo das
// respostas de auth e mantido aqui em memória/sessionStorage.
let csrfToken: string | null = sessionStorage.getItem(CSRF_STORAGE_KEY);

export const getCsrfToken = () => csrfToken;

export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
  if (token) {
    sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  } else {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
  }
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (csrfToken) {
    config.headers.set('X-CSRF-Token', csrfToken);
  }
  return config;
});

const CSRF_MISMATCH_DETAIL = 'Validação de segurança da sessão falhou.';

// Qualquer 401 (sessão ausente/expirada/revogada) derruba o usuário de volta
// para a tela de login, em vez de deixar a SPA presa em chamadas quebradas.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
      return Promise.reject(error);
    }
    // O CSRF token em memória pode ficar desatualizado (ex.: outra aba
    // reemitiu um novo token para a mesma sessão). Nesse caso o backend
    // recusa com 403 + esta mensagem específica — buscamos um token novo e
    // repetimos a requisição original uma única vez antes de desistir.
    const config = error.config;
    if (
      error.response?.status === 403 &&
      error.response?.data?.detail === CSRF_MISMATCH_DETAIL &&
      config && !config._retriedAfterCsrfRefresh
    ) {
      try {
        const refreshed = await api.post<{ csrf_token: string }>('/auth/csrf');
        setCsrfToken(refreshed.data.csrf_token);
        config._retriedAfterCsrfRefresh = true;
        config.headers.set('X-CSRF-Token', refreshed.data.csrf_token);
        return api.request(config);
      } catch {
        // Sem sessão válida para reemitir o token — segue com o erro original.
      }
    }
    return Promise.reject(error);
  },
);

export default api;
