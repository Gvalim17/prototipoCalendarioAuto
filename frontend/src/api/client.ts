import axios from 'axios';

export const AUTH_EXPIRED_EVENT = 'auth:expired';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const csrfToken = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('calendario_csrf='))
    ?.split('=')[1];

  if (csrfToken) {
    config.headers.set('X-CSRF-Token', decodeURIComponent(csrfToken));
  }
  return config;
});

// Qualquer 401 (sessão ausente/expirada/revogada) derruba o usuário de volta
// para a tela de login, em vez de deixar a SPA presa em chamadas quebradas.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  },
);

export default api;
