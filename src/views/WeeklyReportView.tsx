import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import { WeeklyReport, Project, ReportStatus, User } from '../types';
import { formatISODate, formatLocalISODate, getMonthName, parseISODateToLocal } from '../utils';
import { ThemedSelect, type ThemedSelectOption } from '../components/ThemedSelect';

interface WeeklyReportViewProps {
  reports: WeeklyReport[];
  projects: Project[];
  user: User;
  onUpdate: (report: WeeklyReport) => void;
}

const WeeklyReportView: React.FC<WeeklyReportViewProps> = ({ reports, projects, user, onUpdate }) => {
  const navigate = useNavigate();

  const PlusIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

  const CalendarIcon = (props: { className?: string }) => (
    <svg className={props.className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 8h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );

  const ArrowRightIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m13 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const KebabIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" fill="currentColor" />
      <path d="M12 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" fill="currentColor" />
      <path d="M12 15.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" fill="currentColor" />
    </svg>
  );
  
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

  const toStartOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  const isWeekday = (d: Date) => {
    const day = d.getDay();
    return day !== 0 && day !== 6;
  };
  const getWeekStartMonday = (d: Date) => {
    const date = toStartOfDay(d);
    const day = date.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    return addDays(date, diffToMonday);
  };
  const getWeekEndFriday = (d: Date) => addDays(getWeekStartMonday(d), 4);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const root = menuRootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const isWeekdayISO = (isoDate: string) => {
    const day = parseISODateToLocal(isoDate).getDay();
    return day !== 0 && day !== 6;
  };

  const getWeekStartMondayISO = (isoDate: string) => {
    const date = parseISODateToLocal(isoDate);
    const day = date.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diffToMonday);
    return formatLocalISODate(date);
  };

  const addDaysISO = (isoDate: string, days: number) => {
    const date = parseISODateToLocal(isoDate);
    date.setDate(date.getDate() + days);
    return formatLocalISODate(date);
  };

  const getWeekEndFridayISO = (isoDate: string) => addDaysISO(getWeekStartMondayISO(isoDate), 4);

  const computeActiveContributorCount = (names: string) =>
    names
      .split(',')
      .map(s => s.trim())
      .filter(Boolean).length;

  const isPublishable = (r: WeeklyReport) => {
    if (!r.projectId || !r.startDate || !r.endDate) return false;
    if (!isWeekdayISO(r.startDate) || !isWeekdayISO(r.endDate)) return false;
    if (parseISODateToLocal(r.endDate) < parseISODateToLocal(r.startDate)) return false;
    if (parseISODateToLocal(r.endDate) > parseISODateToLocal(getWeekEndFridayISO(r.startDate))) return false;

    if (!Array.isArray(r.goals) || r.goals.length < 3) return false;
    if (r.goals.slice(0, 3).some(g => !g.goal.trim() || !g.successMetric.trim())) return false;

    if (!r.capacity) return false;
    if (!Number.isFinite(r.capacity.plannedHours) || r.capacity.plannedHours <= 0) return false;
    if (!Number.isFinite(r.capacity.committedHours) || r.capacity.committedHours <= 0) return false;
    if (!r.capacity.loadStatus) return false;

    if (!r.strength) return false;
    if (!r.strength.activeContributorNames?.trim()) return false;
    if (computeActiveContributorCount(r.strength.activeContributorNames) <= 0) return false;

    if (!r.sprintHealth) return false;
    if (!r.sprintHealth.startDate) return false;
    if (r.sprintHealth.goalClarity === 'NA' || !r.sprintHealth.goalClarity) return false;
    if (r.sprintHealth.readiness === 'NA' || !r.sprintHealth.readiness) return false;

    if (!r.uedHealth) return false;
    if (!r.uedHealth.lastDiscussion.trim()) return false;
    if (!r.uedHealth.daysSinceLast.trim()) return false;
    if (!r.uedHealth.nextScheduled.trim()) return false;
    if (r.uedHealth.status === 'NA' || !r.uedHealth.status) return false;

    if (!Array.isArray(r.bottlenecks) || r.bottlenecks.length < 3) return false;
    if (r.bottlenecks.slice(0, 3).some(b => !b.trim())) return false;

    if (!Array.isArray(r.decisions) || r.decisions.length < 3) return false;
    if (r.decisions.slice(0, 3).some(d => !d.decisionText.trim())) return false;

    if (!Array.isArray(r.threads) || r.threads.length < 5) return false;
    if (r.threads.slice(0, 5).some(t => !t.product?.trim() || !t.thread.trim() || !t.ownerId || !t.status)) return false;

    return true;
  };

  const publishReport = (r: WeeklyReport) => {
    if (!isPublishable(r)) return;
    onUpdate({ ...r, status: ReportStatus.PUBLISHED, publishedBy: user.id, updatedBy: user.id, updatedAt: new Date().toISOString() });
    setOpenMenuId(null);
    navigate(`/report/${r.id}`);
  };

  const years = ['2023', '2024', '2025', '2026'];
  const months = Array.from({ length: 12 }, (_, i) => ({ val: (i + 1).toString(), label: new Date(2000, i).toLocaleString('default', { month: 'long' }) }));
  const weeks = ['1', '2', '3', '4', '5'];

  const createProjectOptions: ThemedSelectOption[] = projects.map(p => ({
    value: p.id,
    label: p.name,
  }));

  const filterProjectOptions: ThemedSelectOption[] = [
    { value: '', label: 'All' },
    ...projects.map(p => ({ value: p.id, label: p.name })),
  ];

  const yearOptions: ThemedSelectOption[] = years.map(y => ({ value: y, label: y }));
  const monthOptions: ThemedSelectOption[] = [{ value: '', label: 'Any' }, ...months.map(m => ({ value: m.val, label: m.label }))];
  const weekOptions: ThemedSelectOption[] = [{ value: '', label: 'Any' }, ...weeks.map(w => ({ value: w, label: w }))];

  const createStartDate = createForm.startDate ? toStartOfDay(createForm.startDate) : null;
  const endDateMax = createStartDate ? getWeekEndFriday(createStartDate) : undefined;

  const handleCreateInitiate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.startDate || !createForm.endDate) {
      alert("Please select both start and end dates.");
      return;
    }

    const startDateStr = formatLocalISODate(createForm.startDate);
    const endDateStr = formatLocalISODate(createForm.endDate);

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

  const inputClasses = "w-full h-12 bg-white border border-slate-200 rounded-xl px-4 text-[14px] text-slate-900 outline-none focus:ring-4 focus:ring-[#407B7E]/20 focus:border-[#407B7E] transition-colors placeholder:text-slate-400";
  const labelClasses = "block text-[12px] font-semibold text-slate-600 mb-2";

  return (
    <div className="space-y-10" ref={menuRootRef}>
      <div className="bg-gradient-to-br from-[#073D44] to-[#407B7E] rounded-[20px] p-8 md:p-10 text-white border border-white/10 shadow-sm">
        <h1 className="text-[28px] leading-[36px] font-bold tracking-tight">Weekly Report</h1>
        <p className="mt-3 text-[15px] leading-[24px] text-white/80">Create a new snapshot and review historical submissions.</p>
      </div>

      <section className="bg-white p-6 md:p-8 rounded-[20px] border border-slate-200 shadow-sm">
        <div className="flex items-start gap-4 mb-7">
          <div className="w-10 h-10 bg-[#073D44] rounded-xl flex items-center justify-center text-white shadow-sm shrink-0">
            <PlusIcon className="text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[18px] leading-[28px] font-bold text-slate-900 tracking-tight">Create Weekly Report</h2>
            <p className="mt-1 text-[13px] leading-[20px] text-slate-500">Initiate a new snapshot for your team health and goals.</p>
          </div>
        </div>

        <form onSubmit={handleCreateInitiate} className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
          <div className="space-y-2">
            <label className={labelClasses}>Project/Program Name</label>
            <ThemedSelect
              value={createForm.projectId}
              onChange={(projectId) => setCreateForm({ ...createForm, projectId })}
              options={createProjectOptions}
              placeholder={createProjectOptions.length > 0 ? 'Select a project' : 'No projects available'}
              disabled={createProjectOptions.length === 0}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClasses}>Start Date</label>
            <DatePicker
              icon={null}
              selected={createForm.startDate}
              onChange={(date: Date | null) =>
                setCreateForm(prev => {
                  if (!date) return { ...prev, startDate: null, endDate: null };
                  const nextStart = toStartOfDay(date);
                  const max = getWeekEndFriday(nextStart);
                  const nextEnd = prev.endDate ? toStartOfDay(prev.endDate) : null;
                  const endStillValid =
                    nextEnd && nextEnd >= nextStart && nextEnd <= max && isWeekday(nextEnd);
                  return {
                    ...prev,
                    startDate: nextStart,
                    endDate: endStillValid ? nextEnd : null,
                  };
                })
              }
              placeholderText="Select start date"
              className={inputClasses}
              dateFormat="yyyy-MM-dd"
              filterDate={isWeekday}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClasses}>End Date</label>
            <DatePicker
              icon={null}
              selected={createForm.endDate}
              onChange={(date: Date | null) =>
                setCreateForm(prev => ({
                  ...prev,
                  endDate: date ? toStartOfDay(date) : null,
                }))
              }
              placeholderText="Select end date"
              className={inputClasses}
              dateFormat="yyyy-MM-dd"
              minDate={createStartDate || undefined}
              maxDate={endDateMax}
              filterDate={isWeekday}
            />
          </div>
          <div className="md:col-span-3 pt-2 flex justify-end">
            <button 
              type="submit"
              className="h-12 px-6 bg-[#073D44] text-white font-semibold rounded-xl hover:bg-[#0A4A53] transition-colors active:scale-[0.99] flex items-center gap-2"
            >
              Initialize Report <ArrowRightIcon className="text-white" />
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white p-6 md:p-8 rounded-[20px] border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[18px] leading-[28px] font-bold text-slate-900 tracking-tight">Weekly Report Archives</h2>
            <p className="mt-1 text-[13px] leading-[20px] text-slate-500">Filter by project, time period, and week.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className={labelClasses}>Project</label>
            <ThemedSelect
              value={filters.projectId}
              onChange={(projectId) => setFilters({ ...filters, projectId })}
              options={filterProjectOptions}
              placeholder="All"
            />
          </div>
          <div>
            <label className={labelClasses}>Year</label>
            <ThemedSelect
              value={filters.year}
              onChange={(year) => setFilters({ ...filters, year })}
              options={yearOptions}
            />
          </div>
          <div>
            <label className={labelClasses}>Month</label>
            <ThemedSelect
              value={filters.month}
              onChange={(month) => setFilters({ ...filters, month })}
              options={monthOptions}
              placeholder="Any"
            />
          </div>
          <div>
            <label className={labelClasses}>Week</label>
            <ThemedSelect
              value={filters.weekOfMonth}
              onChange={(weekOfMonth) => setFilters({ ...filters, weekOfMonth })}
              options={weekOptions}
              placeholder="Any"
            />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredReports.length > 0 ? (
            filteredReports.map(r => (
              <div key={r.id} className="p-5 bg-white border border-slate-200 rounded-xl hover:border-[#407B7E]/40 hover:shadow-sm transition-all">
                <div className="flex items-center justify-between gap-3">
                  <Link to={`/report/${r.id}`} className="text-[14px] font-semibold text-slate-900 hover:text-[#073D44] truncate">
                    {r.title}
                  </Link>
                  <div className="relative flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600 ring-1 ring-slate-200">{r.status}</span>
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(prev => (prev === r.id ? null : r.id))}
                      className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      aria-label="Report actions"
                    >
                      <KebabIcon />
                    </button>
                    {openMenuId === r.id && (
                      <div className="absolute right-0 top-11 w-44 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden z-20">
                        <button
                          type="button"
                          onClick={() => { setOpenMenuId(null); navigate(`/report/${r.id}`); }}
                          className="w-full text-left px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => { setOpenMenuId(null); navigate(`/edit/${r.id}`); }}
                          className="w-full text-left px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          Edit
                        </button>
                        {r.status === ReportStatus.DRAFT && (
                          <button
                            type="button"
                            onClick={() => publishReport(r)}
                            disabled={!isPublishable(r)}
                            className={`w-full text-left px-3 py-2 text-[13px] font-semibold transition-colors ${
                              isPublishable(r) ? 'text-[#073D44] hover:bg-[#407B7E]/10' : 'text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            Publish
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-[12px] text-slate-500 mt-2 flex gap-4">
                  <span className="flex items-center gap-1.5">
                    <CalendarIcon className="text-slate-400" />
                    {getMonthName(r.month)} - Week {r.weekOfMonth}
                  </span>
                  <span className="text-slate-400">Updated {formatISODate(r.updatedAt)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="md:col-span-2 text-[13px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-10 text-center">
              No reports found for the selected filters.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default WeeklyReportView;
