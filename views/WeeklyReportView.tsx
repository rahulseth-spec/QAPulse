
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
  
  // Create Form State
  const [createForm, setCreateForm] = useState({
    projectId: projects[0]?.id || '',
    startDate: null as Date | null,
    endDate: null as Date | null
  });

  // Search Filter State
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

    // Format dates back to string for the URL
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
      
      {/* 1. Create Weekly Report Section */}
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

      {/* 2. Search & Archives Section */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">Search & Archives</h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Review historical team snapshots</p>
          </div>
        </div>

        {/* Search Filters */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className={labelClasses}>Project/Program Name</label>
            <select className={inputClasses} value={filters.projectId} onChange={e => setFilters({...filters, projectId: e.target.value})}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
            </select>
          </div>
          <div className="w-32">
            <label className={labelClasses}>Year</label>
            <select className={inputClasses} value={filters.year} onChange={e => setFilters({...filters, year: e.target.value})}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="w-40">
            <label className={labelClasses}>Month</label>
            <select className={inputClasses} value={filters.month} onChange={e => setFilters({...filters, month: e.target.value})}>
              <option value="">All Months</option>
              {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
          </div>
          <div className="w-32">
            <label className={labelClasses}>Week</label>
            <select className={inputClasses} value={filters.weekOfMonth} onChange={e => setFilters({...filters, weekOfMonth: e.target.value})}>
              <option value="">Any Week</option>
              {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
            </select>
          </div>
        </div>

        {/* Results List */}
        <div className="grid grid-cols-1 gap-4">
          {filteredReports.length > 0 ? (
            filteredReports.map(report => (
              <Link
                key={report.id}
                to={`/report/${report.id}`}
                className="group flex flex-col md:flex-row md:items-center justify-between bg-white border border-slate-200 p-6 rounded-3xl hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                      report.status === ReportStatus.PUBLISHED ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {report.status}
                    </span>
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">ID: {report.id}</span>
                  </div>
                  <h4 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {report.title}
                  </h4>
                  <div className="flex gap-4 text-xs font-medium text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span className="opacity-60 text-base">📅</span> {getMonthName(report.month)} • Week {report.weekOfMonth}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="opacity-60 text-base">🏗️</span> {projects.find(p => p.id === report.projectId)?.code}
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 md:mt-0 flex items-center gap-4">
                  <div className="text-right hidden md:block">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Updated</div>
                    <div className="text-xs font-bold text-slate-700">{formatISODate(report.updatedAt)}</div>
                  </div>
                  <div className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all">
                    <span>→</span>
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="py-20 bg-slate-100/30 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center text-center px-6">
              <span className="text-4xl mb-4 grayscale opacity-30">📂</span>
              <p className="text-slate-500 font-bold">No reports match your filters.</p>
              <p className="text-slate-400 text-xs mt-1">Try adjusting the month or project selection.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default WeeklyReportView;
