import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import { WeeklyReport, Project, ReportStatus } from '../types';
import { formatISODate, getMonthName } from '../utils';

interface WeeklyReportViewProps {
  reports: WeeklyReport[];
  projects: Project[];
}

const WeeklyReportView: React.FC<WeeklyReportViewProps> = ({ reports, projects }) => {
  const navigate = useNavigate();
  
  const [createForm, setCreateForm] = useState({
    projectId: projects[0]?.id || '',
    startDate: null as Date | null,
    endDate: null as Date | null
  });

  const [filters, setFilters] = useState({
    projectId: '',
    year: new Date().getFullYear().toString(),
    month: '',
    weekOfMonth: '',
  });

  const years = ['2023', '2024', '2025', '2026'];
  const months = Array.from({ length: 12 }, (_, i) => ({ val: (i + 1).toString(), label: new Date(2000, i).toLocaleString('default', { month: 'long' }) }));
  const weeks = ['1', '2', '3', '4', '5'];

  const handleCreateInitiate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.startDate || !createForm.endDate) {
      alert("Please select both start and end dates.");
      return;
    }

    const startDateStr = createForm.startDate.toISOString().split('T')[0];
    const endDateStr = createForm.endDate.toISOString().split('T')[0];

    const params = new URLSearchParams({
      projectId: createForm.projectId,
      startDate: startDateStr,
      endDate: endDateStr
    }).toString();
    
    navigate(`/create?${params}`);
  };

  const filteredReports = reports.filter(r => {
    const matchesProject = !filters.projectId || r.projectId === filters.projectId;
    const matchesYear = !filters.year || r.year.toString() === filters.year;
    const matchesMonth = !filters.month || r.month.toString() === filters.month;
    const matchesWeek = !filters.weekOfMonth || r.weekOfMonth.toString() === filters.weekOfMonth;
    return matchesProject && matchesYear && matchesMonth && matchesWeek;
  });

  const inputClasses = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-slate-400 cursor-pointer hover:bg-white";
  const labelClasses = "block text-[11px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2";

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      
      <section className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40">
        <div className="flex items-center gap-4 mb-8 border-b border-slate-100 pb-6">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-xl shadow-inner">➕</div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Create Weekly Report</h2>
            <p className="text-sm text-slate-500 font-medium">Initiate a new snapshot for your team health and goals.</p>
          </div>
        </div>
        
        <form onSubmit={handleCreateInitiate} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          <div className="space-y-2">
            <label className={labelClasses}>Project/Program Name</label>
            <select 
              className={inputClasses}
              value={createForm.projectId}
              onChange={e => setCreateForm({...createForm, projectId: e.target.value})}
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className={labelClasses}>Start Date</label>
            <DatePicker
              selected={createForm.startDate}
              onChange={(date) => setCreateForm({...createForm, startDate: date})}
              placeholderText="Select start date"
              className={inputClasses}
              dateFormat="yyyy-MM-dd"
            />
          </div>
          <div className="space-y-2">
            <label className={labelClasses}>End Date</label>
            <DatePicker
              selected={createForm.endDate}
              onChange={(date) => setCreateForm({...createForm, endDate: date})}
              placeholderText="Select end date"
              className={inputClasses}
              dateFormat="yyyy-MM-dd"
              minDate={createForm.startDate || undefined}
            />
          </div>
          <div className="md:col-span-3 pt-4 flex justify-end">
            <button 
              type="submit"
              className="px-10 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 shadow-2xl shadow-blue-500/30 transition-all active:scale-95 flex items-center gap-2"
            >
              Initialize Report <span>🚀</span>
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/40">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Weekly Report Archives</h2>
          <Link to="/search" className="text-blue-600 font-medium hover:underline text-sm">Advanced Search</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className={labelClasses}>Project</label>
            <select className={inputClasses} value={filters.projectId} onChange={e => setFilters({...filters, projectId: e.target.value})}>
              <option value="">All</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClasses}>Year</label>
            <select className={inputClasses} value={filters.year} onChange={e => setFilters({...filters, year: e.target.value})}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClasses}>Month</label>
            <select className={inputClasses} value={filters.month} onChange={e => setFilters({...filters, month: e.target.value})}>
              <option value="">Any</option>
              {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClasses}>Week</label>
            <select className={inputClasses} value={filters.weekOfMonth} onChange={e => setFilters({...filters, weekOfMonth: e.target.value})}>
              <option value="">Any</option>
              {weeks.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredReports.map(r => (
            <div key={r.id} className="p-4 bg-white border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between">
                <Link to={`/report/${r.id}`} className="font-semibold text-slate-900 hover:text-blue-700 truncate">
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
      </section>
    </div>
  );
};

export default WeeklyReportView;
