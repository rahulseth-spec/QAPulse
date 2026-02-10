
import React, { useState } from 'react';
import { WeeklyReport, Project, ReportStatus } from '../types';
import { Link } from 'react-router-dom';
import { formatISODate, getMonthName } from '../utils';

interface SearchProps {
  reports: WeeklyReport[];
  projects: Project[];
}

const SearchView: React.FC<SearchProps> = ({ reports, projects }) => {
  const [filters, setFilters] = useState({
    query: '',
    projectId: '',
    status: '',
    month: '',
    year: new Date().getFullYear().toString(),
    weekOfMonth: '',
  });

  const years = ['2023', '2024', '2025', '2026'];
  const months = Array.from({ length: 12 }, (_, i) => ({ val: (i + 1).toString(), label: new Date(2000, i).toLocaleString('default', { month: 'long' }) }));
  const weeks = ['1', '2', '3', '4', '5'];

  const filteredReports = reports.filter(r => {
    const matchesQuery = r.title.toLowerCase().includes(filters.query.toLowerCase());
    const matchesProject = !filters.projectId || r.projectId === filters.projectId;
    const matchesStatus = !filters.status || r.status === filters.status;
    const matchesYear = !filters.year || r.year.toString() === filters.year;
    const matchesMonth = !filters.month || r.month.toString() === filters.month;
    const matchesWeek = !filters.weekOfMonth || r.weekOfMonth.toString() === filters.weekOfMonth;

    return matchesQuery && matchesProject && matchesStatus && matchesYear && matchesMonth && matchesWeek;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold mb-4 text-slate-800">Filter Archives</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="md:col-span-3 lg:col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Search Keywords</label>
            <input 
              placeholder="Title, goals, user..." 
              className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.query}
              onChange={e => setFilters({...filters, query: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Project</label>
            <select className="w-full border rounded-lg px-3 py-2" value={filters.projectId} onChange={e => setFilters({...filters, projectId: e.target.value})}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Status</label>
            <select className="w-full border rounded-lg px-3 py-2" value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})}>
              <option value="">All Statuses</option>
              <option value={ReportStatus.DRAFT}>Draft</option>
              <option value={ReportStatus.PUBLISHED}>Published</option>
              <option value={ReportStatus.APPROVED}>Approved</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Month</label>
            <select className="w-full border rounded-lg px-3 py-2" value={filters.month} onChange={e => setFilters({...filters, month: e.target.value})}>
              <option value="">All Months</option>
              {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Week of Month</label>
            <select className="w-full border rounded-lg px-3 py-2" value={filters.weekOfMonth} onChange={e => setFilters({...filters, weekOfMonth: e.target.value})}>
              <option value="">Any Week</option>
              {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr className="text-left text-slate-500 font-bold">
              <th className="px-6 py-4">Title & Project</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Cycle</th>
              <th className="px-6 py-4">Last Updated</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredReports.map(report => (
              <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900">{report.title}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">{projects.find(p => p.id === report.projectId)?.name}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    report.status === ReportStatus.PUBLISHED ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {report.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                   <div className="text-xs">{getMonthName(report.month)} • Week {report.weekOfMonth}</div>
                   <div className="text-[10px] text-slate-400">Year {report.year}</div>
                </td>
                <td className="px-6 py-4 text-xs text-slate-500">
                  {formatISODate(report.updatedAt)}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link to={`/report/${report.id}`} className="px-4 py-1.5 bg-white border border-slate-200 rounded text-xs font-bold hover:bg-slate-100">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {filteredReports.length === 0 && (
              <tr>
                <td colSpan={5} className="py-20 text-center text-slate-400">
                   No reports match your current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SearchView;
