import React from 'react';
import { WeeklyReport, Project, User, ReportStatus } from '../types';
import { Link } from 'react-router-dom';
import { formatISODate, getMonthName } from '../utils';

interface DashboardProps {
  reports: WeeklyReport[];
  projects: Project[];
  user: User;
  users: User[];
}

const DashboardView: React.FC<DashboardProps> = ({ reports, projects, user, users }) => {
  const CalendarIcon = (props: { className?: string }) => (
    <svg className={props.className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 8h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );

  const UserIcon = (props: { className?: string }) => (
    <svg className={props.className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 21a8 8 0 1 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );

  const PlusIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const userProjects = projects.filter(p => user.projects.includes(p.id));
  const recentReports = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  
  const stats = {
    total: reports.length,
    drafts: reports.filter(r => r.status === ReportStatus.DRAFT).length,
    published: reports.filter(r => r.status === ReportStatus.PUBLISHED).length,
  };

  return (
    <div className="space-y-10">
      <div className="bg-gradient-to-br from-[#073D44] to-[#407B7E] rounded-[20px] p-8 md:p-10 text-white border border-white/10 shadow-sm">
        <h1 className="text-[32px] leading-[40px] font-bold tracking-tight">Welcome back, {user.name.split(' ')[0]}!</h1>
        <p className="mt-3 mb-6 text-[15px] leading-[24px] text-white/80">Manage your QA weekly reports and track team health effortlessly.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/70 mb-1">Active Projects</div>
            <div className="text-[24px] leading-[32px] font-bold">{userProjects.length}</div>
          </div>
          <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/70 mb-1">Reports in Draft</div>
            <div className="text-[24px] leading-[32px] font-bold">{stats.drafts}</div>
          </div>
          <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/70 mb-1">Published Reports</div>
            <div className="text-[24px] leading-[32px] font-bold">{stats.published}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[18px] leading-[28px] font-bold text-slate-900 tracking-tight">Recent Reports</h3>
            <Link to="/weekly-reports" className="text-[#407B7E] font-semibold hover:text-[#073D44] text-[13px]">View All</Link>
          </div>
          <div className="space-y-3">
            {recentReports.length > 0 ? (
              recentReports.map(report => (
                <Link
                  key={report.id}
                  to={`/report/${report.id}`}
                  className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-[#407B7E]/40 hover:shadow-sm transition-all group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      report.status === ReportStatus.PUBLISHED ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                    }`}>
                      {report.status}
                    </span>
                    <span className="text-[12px] text-slate-400">{formatISODate(report.updatedAt)}</span>
                  </div>
                  <h4 className="text-[15px] leading-[22px] font-semibold text-slate-900 group-hover:text-[#073D44] transition-colors mb-1 truncate">
                    {report.title}
                  </h4>
                  <div className="flex gap-4 text-[12px] text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon className="text-slate-400" />
                      <span>{getMonthName(report.month)} - Week {report.weekOfMonth}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <UserIcon className="text-slate-400" />
                      <span className="truncate">{users.find(u => u.id === report.createdBy)?.name || 'Unknown'}</span>
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="text-center py-12 bg-white border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-slate-400">No reports found.</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 uppercase tracking-wider text-xs">Quick Actions</h3>
            <div className="space-y-3">
              <Link to="/create" className="h-12 px-4 flex items-center gap-3 w-full bg-[#073D44] text-white rounded-xl font-semibold text-[14px] hover:bg-[#0A4A53] transition-colors">
                <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <PlusIcon className="text-white" />
                </span>
                Create New Report
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
