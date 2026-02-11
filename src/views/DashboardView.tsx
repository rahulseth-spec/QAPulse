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
  const userProjects = projects.filter(p => user.projects.includes(p.id));
  const recentReports = [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  
  const stats = {
    total: reports.length,
    drafts: reports.filter(r => r.status === ReportStatus.DRAFT).length,
    published: reports.filter(r => r.status === ReportStatus.PUBLISHED).length,
  };

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl p-8 text-white shadow-xl">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {user.name.split(' ')[0]}!</h1>
        <p className="text-blue-100/80 mb-6">Manage your QA weekly reports and track team health effortlessly.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm">
            <div className="text-blue-200 text-xs font-bold uppercase mb-1">Active Projects</div>
            <div className="text-2xl font-bold">{userProjects.length}</div>
          </div>
          <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm">
            <div className="text-blue-200 text-xs font-bold uppercase mb-1">Reports in Draft</div>
            <div className="text-2xl font-bold">{stats.drafts}</div>
          </div>
          <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm">
            <div className="text-blue-200 text-xs font-bold uppercase mb-1">Total Published</div>
            <div className="text-2xl font-bold">{stats.published}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-slate-800">Recent Reports</h3>
            <Link to="/search" className="text-blue-600 font-medium hover:underline text-sm">View All</Link>
          </div>
          <div className="space-y-3">
            {recentReports.length > 0 ? (
              recentReports.map(report => (
                <Link
                  key={report.id}
                  to={`/report/${report.id}`}
                  className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      report.status === ReportStatus.PUBLISHED ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {report.status}
                    </span>
                    <span className="text-xs text-slate-400">{formatISODate(report.updatedAt)}</span>
                  </div>
                  <h4 className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors mb-1 truncate">
                    {report.title}
                  </h4>
                  <div className="flex gap-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      📅 {getMonthName(report.month)} - Week {report.weekOfMonth}
                    </div>
                    <div className="flex items-center gap-1">👤 {users.find(u => u.id === report.createdBy)?.name || 'Unknown'}</div>
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
            <div className="space-y-2">
              <Link to="/create" className="flex items-center gap-3 w-full p-3 bg-blue-50 text-blue-700 rounded-lg font-medium hover:bg-blue-100 transition-colors">
                <span className="bg-blue-600 text-white w-6 h-6 rounded flex items-center justify-center text-xs">+</span>
                Create New Report
              </Link>
              <Link to="/search" className="flex items-center gap-3 w-full p-3 bg-slate-50 text-slate-700 rounded-lg font-medium hover:bg-slate-100 transition-colors">
                <span className="bg-slate-200 text-slate-600 w-6 h-6 rounded flex items-center justify-center text-xs">🔍</span>
                Advanced Search
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 uppercase tracking-wider text-xs">My Projects</h3>
            <div className="space-y-3">
              {userProjects.map(project => (
                <div key={project.id} className="flex items-center gap-3 p-2 group cursor-pointer hover:bg-slate-50 rounded-lg">
                  <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-sm font-bold text-slate-500 group-hover:bg-blue-100 group-hover:text-blue-600">
                    {project.code}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{project.name}</div>
                    <div className="text-[10px] text-slate-400">{reports.filter(r => r.projectId === project.id).length} Reports</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
