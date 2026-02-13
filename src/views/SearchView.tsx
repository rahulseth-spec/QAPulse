import React, { useState } from 'react';
import { WeeklyReport, Project, ReportStatus } from '../types';
import { Link } from 'react-router-dom';
import { formatISODate, getMonthName } from '../utils';
import { ThemedSelect, type ThemedSelectOption } from '../components/ThemedSelect';

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

  const projectOptions: ThemedSelectOption[] = [
    { value: '', label: 'All Projects' },
    ...projects.map(p => ({ value: p.id, label: p.code })),
  ];

  const statusOptions: ThemedSelectOption[] = [
    { value: '', label: 'Any' },
    ...Object.values(ReportStatus).map(s => ({ value: s, label: s })),
  ];

  const monthOptions: ThemedSelectOption[] = [{ value: '', label: 'Any' }, ...months.map(m => ({ value: m.val, label: m.label }))];
  const yearOptions: ThemedSelectOption[] = years.map(y => ({ value: y, label: y }));
  const weekOptions: ThemedSelectOption[] = [{ value: '', label: 'Any' }, ...weeks.map(w => ({ value: w, label: w }))];

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
            <ThemedSelect
              value={filters.projectId}
              onChange={(projectId) => setFilters({ ...filters, projectId })}
              options={projectOptions}
              placeholder="All Projects"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Status</label>
            <ThemedSelect
              value={filters.status}
              onChange={(status) => setFilters({ ...filters, status })}
              options={statusOptions}
              placeholder="Any"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Month</label>
            <ThemedSelect
              value={filters.month}
              onChange={(month) => setFilters({ ...filters, month })}
              options={monthOptions}
              placeholder="Any"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Year</label>
            <ThemedSelect
              value={filters.year}
              onChange={(year) => setFilters({ ...filters, year })}
              options={yearOptions}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Week</label>
            <ThemedSelect
              value={filters.weekOfMonth}
              onChange={(weekOfMonth) => setFilters({ ...filters, weekOfMonth })}
              options={weekOptions}
              placeholder="Any"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-800">Results</h3>
          <span className="text-sm text-slate-500">{filteredReports.length} found</span>
        </div>
        <div className="divide-y">
          {filteredReports.map(r => (
            <div key={r.id} className="p-4 hover:bg-slate-50">
              <div className="flex items-center justify-between">
                <Link to={`/report/${r.id}`} className="font-semibold text-slate-900 hover:text-blue-700">
                  {r.title}
                </Link>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">{r.status}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1 flex gap-4">
                <span>📅 {getMonthName(r.month)} - Week {r.weekOfMonth}</span>
                <span>Updated {formatISODate(r.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchView;
