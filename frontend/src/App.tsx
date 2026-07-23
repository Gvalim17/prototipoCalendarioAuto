import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ScheduleForm from './pages/ScheduleForm';
import ScheduleList from './pages/ScheduleList';
import CourseList from './pages/CourseList';
import HolidayRecessList from './pages/HolidayRecessList';
import Logs from './pages/Logs';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Alerts from './pages/Alerts';
import Users from './pages/Users';
import LessonPlanner from './pages/LessonPlanner';

function AuthenticatedApp() {
  const { user, loading } = useAuth();
  // Um link de redefinição de senha deve sempre abrir a tela cheia de login,
  // mesmo que a aba já tenha uma sessão ativa de outra conta.
  const isResetPasswordLink = window.location.pathname === '/reset-password';

  if (loading) {
    return <main className="min-h-screen bg-bg text-muted grid place-items-center text-sm">Carregando...</main>;
  }
  if (!user || isResetPasswordLink) return <Login />;

  return (
    <Router>
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
          <Route path="/users" element={user.role === 'admin' ? <Users /> : <Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

function App() {
  return <ThemeProvider><AuthProvider><AuthenticatedApp /></AuthProvider></ThemeProvider>;
}

export default App;
