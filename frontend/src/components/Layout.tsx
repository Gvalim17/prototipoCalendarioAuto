import React, { ReactNode } from 'react';
import { LayoutDashboard, Calendar, GraduationCap, CalendarClock, CalendarDays, ScrollText, Menu, Sun, Moon, LogOut, Bell, Users as UsersIcon, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const initials = user?.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CA';

  return (
    <div className="min-h-screen bg-bg text-ink flex">
      {/* Sidebar */}
      <aside className="w-64 bg-surface border-r border-line flex-col hidden md:flex">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
              <Calendar className="text-accent-fg" size={22} />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-ink leading-tight">
                Calendário Acadêmico
              </h1>
              <p className="text-[10px] uppercase tracking-widest text-muted font-medium">Gestão de Cronogramas</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-2">
          <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Painel" active={location.pathname === '/'} />
          <NavItem to="/courses" icon={<GraduationCap size={18} />} label="Cursos" active={location.pathname.startsWith('/courses') || location.pathname.startsWith('/mbas')} />
          <NavItem to="/generate" icon={<Calendar size={18} />} label="Gerar Cronogramas" active={location.pathname.startsWith('/generate')} />
          <NavItem to="/schedules" icon={<CalendarDays size={18} />} label="Cronogramas" active={location.pathname === '/schedules'} />
          <NavItem to="/holidays" icon={<CalendarClock size={18} />} label="Feriados e Recessos" active={location.pathname === '/holidays'} />
          <NavItem to="/alerts" icon={<Bell size={18} />} label="Alertas" active={location.pathname === '/alerts'} />
          <NavItem to="/privacidade" icon={<ShieldCheck size={18} />} label="Privacidade" active={location.pathname === '/privacidade'} />
          {user?.role === 'admin' && (
            <NavItem to="/logs" icon={<ScrollText size={18} />} label="Logs do Sistema" active={location.pathname === '/logs'} />
          )}
          {user?.role === 'admin' && (
            <NavItem to="/users" icon={<UsersIcon size={18} />} label="Usuários" active={location.pathname === '/users'} />
          )}
        </nav>

        <div className="p-4">
          <div className="p-4 rounded-xl bg-surface-2 border border-line">
            <p className="text-[11px] text-muted leading-relaxed">
              Sistema de apoio à coordenação acadêmica para geração e organização de cronogramas de aulas.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-line flex items-center justify-between px-6 md:px-8 bg-surface/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-2 hover:bg-surface-2 rounded-lg text-muted">
              <Menu size={20} />
            </button>
            <h2 className="text-sm font-medium text-muted hidden sm:block">Coordenação acadêmica</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
              className="w-9 h-9 rounded-lg border border-line bg-surface-2 flex items-center justify-center text-muted hover:text-ink transition-colors"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="hidden sm:block text-right leading-tight mr-1">
              <p className="text-xs font-medium text-ink">{user?.name}</p>
              <p className="text-[11px] text-muted capitalize">{user?.role}</p>
            </div>
            <div title={user?.name} className="w-9 h-9 rounded-full bg-surface-2 border border-line flex items-center justify-center text-xs font-semibold text-ink">
              {initials}
            </div>
            <button onClick={() => void logout()} aria-label="Sair" title="Sair" className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          {children}
        </div>
      </main>
    </div>
  );
};

interface NavItemProps {
  to: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
}

const NavItem = ({ to, icon, label, active = false }: NavItemProps) => (
  <Link
    to={to}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
      active
        ? 'bg-accent/10 text-accent border border-accent/20'
        : 'text-muted hover:bg-surface-2 hover:text-ink border border-transparent'
    }`}
  >
    {icon}
    <span>{label}</span>
  </Link>
);

export default Layout;
