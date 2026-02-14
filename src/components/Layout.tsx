import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { User } from '../types';

interface LayoutProps {
  user: User;
  logout: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ user, logout, children }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('qa.sidebarCollapsed') === '1';
  });

  React.useEffect(() => {
    window.localStorage.setItem('qa.sidebarCollapsed', isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  const PulseIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12h4l2-5 4 10 2-5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const DashboardIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 4h7v9H4V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 4h7v5h-7V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 11h7v9h-7v-9Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 15h7v5H4v-5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );

  const ReportIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h8l4 4v14H7V3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M15 3v4h4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 11h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const DocsIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 4h10l2 2v14H6V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8.5 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8.5 14H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const SignOutIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M3 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 8l-4 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const MenuIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="16" height="2.5" rx="1.25" fill="currentColor" />
      <rect x="4" y="10.75" width="16" height="2.5" rx="1.25" fill="currentColor" />
      <rect x="4" y="15.5" width="16" height="2.5" rx="1.25" fill="currentColor" />
    </svg>
  );

  const BackIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const navItems = [
    { label: 'Dashboard', path: '/', icon: DashboardIcon },
    { label: 'Weekly Report', path: '/weekly-reports', icon: ReportIcon },
    { label: 'FAQ', path: '/docs', icon: DocsIcon },
  ];

  const isReportView = location.pathname.startsWith('/report/');
  const headerTitle = isReportView ? 'Weekly Report' : (navItems.find(i => i.path === location.pathname)?.label || 'System View');

  return (
    <div className="flex h-screen overflow-hidden bg-[#F6F7F8]">
      <aside className={`${isSidebarCollapsed ? 'w-[88px]' : 'w-[280px]'} bg-gradient-to-b from-[#073D44] to-[#407B7E] text-white flex flex-col shrink-0 border-r border-[#073D44] transition-[width] duration-200`}>
        <div className={`${isSidebarCollapsed ? 'px-4' : 'px-6'} pt-7 pb-6 border-b border-white/15`}>
          <div className={isSidebarCollapsed ? 'flex flex-col items-center gap-3' : 'flex items-center justify-between gap-3'}>
            <div className={isSidebarCollapsed ? 'flex flex-col items-center gap-3' : 'flex items-center gap-3 min-w-0'}>
              <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center text-[#073D44] shadow-sm shrink-0">
                <PulseIcon className="text-[#073D44]" />
              </div>
              {!isSidebarCollapsed && (
                <div className="leading-tight min-w-0">
                  <div className="text-[15px] font-semibold text-white tracking-tight">
                    <span className="font-extrabold">QA</span>
                    <span className="font-semibold">Pulse</span>
                  </div>
                  <div className="text-[11px] text-white/70">by <span className="font-bold text-white">ConveGenius</span></div>
                </div>
              )}
            </div>

            <button
              type="button"
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setIsSidebarCollapsed(v => !v)}
              className="w-9 h-9 rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/15 transition-colors flex items-center justify-center shrink-0"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
        
        <nav className={`flex-1 ${isSidebarCollapsed ? 'px-3' : 'px-4'} py-5 space-y-2`}>
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-3' : 'gap-3 px-4'} py-3 rounded-xl transition-colors ${
                location.pathname === item.path 
                  ? 'bg-white text-[#073D44]' 
                  : 'hover:bg-white/10 text-white/90'
              }`}
            >
              <item.icon className={location.pathname === item.path ? 'text-[#073D44]' : 'text-white/70'} />
              {!isSidebarCollapsed && (
                <span className={`font-semibold text-[14px] ${location.pathname === item.path ? 'text-[#073D44]' : 'text-white'}`}>{item.label}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-white/15">
          {!isSidebarCollapsed && (
            <div className="mb-4 px-4">
              <div className="text-[10px] text-white/60 uppercase font-extrabold tracking-[0.16em] mb-1">Session</div>
              <div className="font-semibold text-white text-sm truncate">{user.name}</div>
              <div className="text-[11px] text-white/70 mt-0.5 truncate">
                {user.email}
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className={`${isSidebarCollapsed ? 'justify-center px-3' : 'text-left px-4'} w-full py-2.5 hover:bg-red-500/20 hover:text-white transition-colors rounded-xl flex items-center gap-2 text-sm font-semibold text-white`}
          >
            <SignOutIcon className="text-white/70" />
            {!isSidebarCollapsed && 'Sign Out'}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-[#CFE8E8]/95 backdrop-blur border-b border-[#073D44]/20 flex items-center justify-between px-6 lg:px-12 sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-4">
            {isReportView && (
              <button
                type="button"
                aria-label="Back"
                onClick={() => navigate(-1)}
                className="w-9 h-9 rounded-xl bg-white/65 border border-[#073D44]/25 text-[#073D44] hover:bg-white/80 transition-colors flex items-center justify-center"
              >
                <BackIcon />
              </button>
            )}
            <h2 className="text-[14px] font-semibold text-[#073D44] tracking-tight">
              {headerTitle}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold text-[#073D44] bg-white/65 border border-[#073D44]/25 px-2.5 py-1 rounded-lg uppercase tracking-widest">
              Build v1.2.0
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-12 scroll-smooth">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
