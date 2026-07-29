import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ScheduleForm from './pages/ScheduleForm';
import ScheduleList from './pages/ScheduleList';
import CourseList from './pages/CourseList';
import HolidayRecessList from './pages/HolidayRecessList';
import Logs from './pages/Logs';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Alerts from './pages/Alerts';
import Users from './pages/Users';
import LessonPlanner from './pages/LessonPlanner';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Reports from './pages/Reports';
import Help from './pages/Help';
import { TourProvider } from './contexts/TourContext';

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  // Um link de redefinição de senha deve sempre abrir a tela cheia de login,
  // mesmo que a aba já tenha uma sessão ativa de outra conta.
  const isResetPasswordLink = window.location.pathname === '/reset-password';
  // Termos de Uso e Política de Privacidade precisam ser acessíveis mesmo sem
  // conta (ex.: link compartilhado, consulta antes do cadastro).
  const isTermsLink = window.location.pathname === '/termos';
  if (isTermsLink) return <Terms />;

  if (loading) {
    return <main className="min-h-screen bg-bg text-muted grid place-items-center text-sm">Carregando...</main>;
  }
  if (!user || isResetPasswordLink) return <Login />;

  return (
    <Router>
      <TourProvider userId={user.id}>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/courses/*" element={<CourseList />} />
            <Route path="/mbas/*" element={<Navigate to="/courses" replace />} />
            <Route path="/holidays" element={<HolidayRecessList />} />
            <Route path="/schedules" element={<ScheduleList />} />
            <Route path="/schedules/:configId/plan" element={<LessonPlanner />} />
            <Route path="/generate" element={<ScheduleForm />} />
            <Route path="/generate/:configId" element={<ScheduleForm />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/privacidade" element={<Privacy />} />
            <Route path="/relatorios" element={<Reports />} />
            <Route path="/ajuda" element={<Help />} />
            <Route path="/users" element={user.role === 'admin' ? <Users /> : <Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </TourProvider>
    </Router>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider><AuthenticatedApp /></AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
