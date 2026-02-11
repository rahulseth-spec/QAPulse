import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User } from '../types';

interface LayoutProps {
  user: User;
  logout: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ user, logout, children }) => {
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', path: '/', icon: '📊' },
    { label: 'Weekly Report', path: '/weekly-reports', icon: '📝' },
    { label: 'System Docs', path: '/docs', icon: '📖' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">Q</div>
          <span className="text-xl font-bold text-white tracking-tight">QAPulse</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                location.pathname === item.path 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                  : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="font-semibold">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="mb-4 px-4">
            <div className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] mb-1">Session</div>
            <div className="font-bold text-white text-sm truncate">{user.name}</div>
            <div className="text-[10px] text-slate-400 mt-0.5 italic truncate">
              {user.email}
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full text-left px-4 py-2 hover:bg-red-500/10 hover:text-red-400 transition-all rounded-lg flex items-center gap-2 text-sm font-bold"
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10 shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
             <h2 className="text-lg font-black text-slate-800 tracking-tight uppercase">
              {navItems.find(i => i.path === location.pathname)?.label || 'System View'}
             </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg uppercase tracking-widest">Build v1.2.0</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
