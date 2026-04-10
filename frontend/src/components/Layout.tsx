import React from 'react';
import { LayoutDashboard, Calendar, Settings, Info, Menu, GraduationCap, Coffee } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 flex">
      {/* Sidebar */}
      <aside className="w-64 glass border-r border-slate-800 flex flex-col hidden md:flex">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Calendar className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">MBA <span className="text-blue-500">Calendário</span></h1>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Gestão Inteligente</p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavItem 
            to="/" 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={location.pathname === '/'} 
          />
          <NavItem 
            to="/mbas" 
            icon={<GraduationCap size={20} />} 
            label="Gestão de MBAs" 
            active={location.pathname.startsWith('/mbas')} 
          />
          <NavItem 
            to="/holidays" 
            icon={<Coffee size={20} />} 
            label="Feriados & Recessos" 
            active={location.pathname === '/holidays'} 
          />
          <NavItem 
            to="/generate" 
            icon={<Calendar size={20} />} 
            label="Gerar Cronograma" 
            active={location.pathname === '/generate'} 
          />
          <NavItem 
            to="/settings" 
            icon={<Settings size={20} />} 
            label="Configurações" 
            active={location.pathname === '/settings'} 
          />
        </nav>

        <div className="p-4 mt-auto">
          <div className="p-4 rounded-2xl bg-slate-800/50 border border-slate-700">
            <div className="flex items-center gap-2 mb-2 text-blue-400">
              <Info size={16} />
              <span className="text-xs font-bold uppercase">Suporte Institucional</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Sistema de auxílio à coordenação acadêmica para geração de cronogramas.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-[#0f172a]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button className="md:hidden p-2 hover:bg-slate-800 rounded-lg">
              <Menu size={20} />
            </button>
            <h2 className="text-sm font-medium text-slate-400">Bem-vindo, Coordenador</h2>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold">
               GU
             </div>
          </div>
        </header>

        {/* Page Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {children}
        </div>
      </main>
    </div>
  );
};

const NavItem = ({ to, icon, label, active = false }: { to: string, icon: any, label: string, active?: boolean }) => (
  <Link to={to} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
    active 
      ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-sm shadow-blue-500/5' 
      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
  }`}>
    {icon}
    <span className="text-sm font-medium">{label}</span>
  </Link>
);

export default Layout;
