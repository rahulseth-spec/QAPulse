import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { WeeklyReport, Project, ReportStatus, User } from '../types';
import { formatISODate, getMonthName } from '../utils';
import { ThemedSelect, type ThemedSelectOption } from '../components/ThemedSelect';

interface WeeklyReportViewProps {
  reports: WeeklyReport[];
  projects: Project[];
  user: User;
  users: User[];
  onUpdate: (report: WeeklyReport) => void;
  onDelete: (id: string) => void;
}

const WeeklyReportView: React.FC<WeeklyReportViewProps> = ({ reports, projects, user, users, onUpdate, onDelete }) => {
  const navigate = useNavigate();

  const KebabIcon = (props: { className?: string }) => (
    <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" fill="currentColor" />
      <path d="M12 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" fill="currentColor" />
      <path d="M12 15.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" fill="currentColor" />
    </svg>
  );

  const [archiveMode, setArchiveMode] = useState<'PROJECT' | 'ALL'>('PROJECT');
  const [filters, setFilters] = useState({
    projectId: '',
    year: '',
    month: '',
    weekOfMonth: '',
    status: '',
  });

  useEffect(() => {
    if (archiveMode === 'ALL') {
      setFilters(prev => (prev.projectId ? { ...prev, projectId: '' } : prev));
    }
  }, [archiveMode]);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const menuDropdownRef = useRef<HTMLDivElement | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; direction: 'down' | 'up' } | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importModeRef = useRef<'PROJECT' | 'OVERALL'>('PROJECT');

  const triggerImport = (mode: 'PROJECT' | 'OVERALL') => {
    importModeRef.current = mode;
    importInputRef.current?.click();
  };

  const handleImportSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const pptx = list.find(f => /\.pptx$/i.test(f.name));
    const ppt = list.find(f => /\.ppt$/i.test(f.name));
    if (!pptx && ppt) {
      window.alert('Old .ppt files are not supported. Please save/export as .pptx and upload again.');
      if (importInputRef.current) importInputRef.current.value = '';
      return;
    }
    if (!pptx) {
      window.alert('Please upload a .pptx file.');
      if (importInputRef.current) importInputRef.current.value = '';
      return;
    }

    const mode = importModeRef.current;
    const projectId = mode === 'PROJECT' ? (filters.projectId || projects[0]?.id || '') : '';
    const params = new URLSearchParams({
      ...(mode === 'PROJECT' && projectId ? { projectId } : {}),
      ...(mode === 'OVERALL' ? { mode: 'overall' } : {}),
      import: '1',
    }).toString();

    try {
      const buf = await pptx.arrayBuffer();
      (window as any).__QAPULSE_IMPORT__ = { buf, name: pptx.name };
      navigate(`/create?${params}`);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const root = menuRootRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      if (e.target instanceof Node && menuDropdownRef.current?.contains(e.target)) return;
      setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const updateMenuPosition = () => {
    const anchor = menuAnchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 8;
    const menuWidth = 176;
    const estimatedMenuHeight = 240;

    const spaceBelow = window.innerHeight - rect.bottom;
    const direction = spaceBelow < estimatedMenuHeight + gap ? 'up' : 'down';

    const desiredLeft = rect.right - menuWidth;
    const left = Math.min(Math.max(8, desiredLeft), window.innerWidth - menuWidth - 8);

    setMenuPos({
      left,
      top: direction === 'down' ? rect.bottom + gap : rect.top - gap,
      direction,
    });
  };

  useEffect(() => {
    if (!openMenuId) return;
    updateMenuPosition();

    const onResize = () => updateMenuPosition();
    const onScroll = () => updateMenuPosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openMenuId]);

  const years = ['2023', '2024', '2025', '2026'];
  const months = Array.from({ length: 12 }, (_, i) => ({ val: (i + 1).toString(), label: new Date(2000, i).toLocaleString('default', { month: 'long' }) }));
  const weeks = ['1', '2', '3', '4', '5'];

  const filterProjectOptions: ThemedSelectOption[] = [{ value: '', label: 'Any' }, ...projects.map(p => ({ value: p.id, label: p.name }))];

  const yearOptions: ThemedSelectOption[] = [{ value: '', label: 'Any' }, ...years.map(y => ({ value: y, label: y }))];
  const monthOptions: ThemedSelectOption[] = [{ value: '', label: 'Any' }, ...months.map(m => ({ value: m.val, label: m.label }))];
  const weekOptions: ThemedSelectOption[] = [{ value: '', label: 'Any' }, ...weeks.map(w => ({ value: w, label: w }))];
  const statusOptions: ThemedSelectOption[] = [
    { value: '', label: 'Any' },
    { value: ReportStatus.DRAFT, label: 'DRAFT' },
    { value: ReportStatus.PUBLISHED, label: 'PUBLISHED' },
    { value: ReportStatus.APPROVED, label: 'APPROVED' },
  ];

  const getStatusDotClassName = (value: string) => {
    if (value === ReportStatus.PUBLISHED) return 'bg-emerald-500';
    if (value === ReportStatus.APPROVED) return 'bg-indigo-500';
    if (value === ReportStatus.DRAFT) return 'bg-slate-400';
    return 'bg-slate-300';
  };

  const findUserName = (id: string | undefined | null) => (id ? users.find(u => u.id === id)?.name : undefined);
  const getUserName = (id: string | undefined | null) => findUserName(id) || '—';

  const getPublishedByName = (report: WeeklyReport) => {
    if (report.status === ReportStatus.PUBLISHED) {
      return findUserName(report.publishedBy) || findUserName(report.updatedBy) || findUserName(report.createdBy) || '—';
    }
    return getUserName(report.createdBy);
  };

  const filteredReports = reports.filter(r => {
    const matchesProject = archiveMode === 'ALL' ? true : (!filters.projectId || r.projectId === filters.projectId);
    const matchesYear = !filters.year || r.year.toString() === filters.year;
    const matchesMonth = !filters.month || r.month.toString() === filters.month;
    const matchesWeek = !filters.weekOfMonth || r.weekOfMonth.toString() === filters.weekOfMonth;
    const matchesStatus = !filters.status || r.status === (filters.status as any);
    return matchesProject && matchesYear && matchesMonth && matchesWeek && matchesStatus;
  });

  const getProjectLabel = (report: WeeklyReport) => {
    if (report.scope === 'OVERALL' || !report.projectId) return 'All Projects';
    return projects.find(p => p.id === report.projectId)?.name || '—';
  };

  const labelClasses = "block text-[12px] font-semibold text-slate-600 mb-2";

  const openReport = openMenuId ? filteredReports.find(r => r.id === openMenuId) : undefined;
  const dropdownNode =
    openMenuId && openReport && menuPos
      ? createPortal(
          <div
            ref={menuDropdownRef}
            style={{
              position: 'fixed',
              left: menuPos.left,
              width: 176,
              top: menuPos.direction === 'down' ? menuPos.top : undefined,
              bottom: menuPos.direction === 'up' ? window.innerHeight - menuPos.top : undefined,
              zIndex: 60,
            }}
            className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
          >
            <button
              type="button"
              onClick={() => { setOpenMenuId(null); setMenuPos(null); navigate(`/report/${openReport.id}`); }}
              className="w-full text-left px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              View
            </button>
            {openReport.createdBy === user.id && (
              <button
                type="button"
                onClick={() => { setOpenMenuId(null); setMenuPos(null); navigate(`/edit/${openReport.id}`); }}
                className="w-full text-left px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => { setOpenMenuId(null); setMenuPos(null); navigate(`/report/${openReport.id}`, { state: { autoPrint: true } }); }}
              className="w-full text-left px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => { setOpenMenuId(null); setMenuPos(null); navigate(`/report/${openReport.id}`, { state: { autoPpt: true } }); }}
              className="w-full text-left px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Download PPT
            </button>
            {openReport.createdBy === user.id && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('Delete this report?')) return;
                  setOpenMenuId(null);
                  setMenuPos(null);
                  onDelete(openReport.id);
                }}
                className="w-full text-left px-3 py-2 text-[13px] font-semibold text-rose-700 hover:bg-rose-50 transition-colors"
              >
                Delete
              </button>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-10" ref={menuRootRef}>
      <div className="bg-gradient-to-br from-[#073D44] to-[#407B7E] rounded-[20px] p-8 md:p-10 text-white border border-white/10 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[28px] leading-[36px] font-bold tracking-tight">Weekly Report</h1>
            <p className="mt-3 text-[15px] leading-[24px] text-white/80">Review historical submissions and export reports.</p>
          </div>
          <div className="shrink-0">
            <input
              ref={importInputRef}
              type="file"
              accept=".ppt,.pptx"
              multiple
              className="hidden"
              onChange={(e) => handleImportSelected(e.target.files)}
            />
            <div className="rounded-2xl bg-white/10 border border-white/15 p-3 backdrop-blur-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-[280px]">
                <button
                  type="button"
                  onClick={() => {
                    const projectId = filters.projectId || projects[0]?.id || '';
                    const params = new URLSearchParams(projectId ? { projectId } : {}).toString();
                    navigate(params ? `/create?${params}` : '/create');
                  }}
                  className="h-11 w-full px-4 rounded-xl bg-white text-[#073D44] font-semibold text-[13px] shadow-sm hover:bg-white/90 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Create (Project wise)
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/create?mode=overall')}
                  className="h-11 w-full px-4 rounded-xl bg-white text-[#073D44] font-semibold text-[13px] shadow-sm hover:bg-white/90 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Create (All Projects)
                </button>

                <button
                  type="button"
                  aria-label="Import (Project wise)"
                  onClick={() => triggerImport('PROJECT')}
                  className="h-11 w-full px-4 rounded-xl bg-white/12 text-white font-semibold text-[13px] border border-white/20 hover:bg-white/18 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 3v10m0 0 4-4m-4 4-4-4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Import (Project wise)
                </button>

                <button
                  type="button"
                  aria-label="Import (All Projects)"
                  onClick={() => triggerImport('OVERALL')}
                  className="h-11 w-full px-4 rounded-xl bg-white/12 text-white font-semibold text-[13px] border border-white/20 hover:bg-white/18 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 3v10m0 0 4-4m-4 4-4-4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Import (All Projects)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="bg-white p-6 md:p-8 rounded-[20px] border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[18px] leading-[28px] font-bold text-slate-900 tracking-tight">Weekly Report Archives</h2>
            <p className="mt-1 text-[13px] leading-[20px] text-slate-500">Filter by time period, status, and export reports.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center p-1 rounded-xl bg-[#CFE8E8] border border-[#073D44]/15">
              <button
                type="button"
                onClick={() => { setArchiveMode('PROJECT'); setOpenMenuId(null); }}
                className={`h-9 px-3 rounded-lg text-[12px] font-semibold transition-colors ${
                  archiveMode === 'PROJECT' ? 'bg-white text-[#073D44] shadow-sm' : 'text-[#073D44]/80 hover:text-[#073D44]'
                }`}
              >
                Project wise
              </button>
              <button
                type="button"
                onClick={() => { setArchiveMode('ALL'); setOpenMenuId(null); }}
                className={`h-9 px-3 rounded-lg text-[12px] font-semibold transition-colors ${
                  archiveMode === 'ALL' ? 'bg-white text-[#073D44] shadow-sm' : 'text-[#073D44]/80 hover:text-[#073D44]'
                }`}
              >
                All projects combined
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setFilters(prev => ({
                  projectId: '',
                  year: '',
                  month: '',
                  weekOfMonth: '',
                  status: '',
                }));
                setOpenMenuId(null);
              }}
              className="h-10 px-4 rounded-xl bg-white border border-[#073D44]/30 text-[#073D44] font-semibold text-[13px] hover:bg-[#073D44] hover:text-white transition-colors"
            >
              Reset Filters
            </button>
          </div>
        </div>
        <div className={`grid grid-cols-1 ${archiveMode === 'PROJECT' ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4`}>
          {archiveMode === 'PROJECT' && (
            <div>
              <label className={labelClasses}>Project</label>
              <ThemedSelect
                value={filters.projectId}
                onChange={(projectId) => setFilters({ ...filters, projectId })}
                options={filterProjectOptions}
                placeholder="Any"
              />
            </div>
          )}
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
          <div>
            <label className={labelClasses}>Status</label>
            <ThemedSelect
              value={filters.status}
              onChange={(status) => setFilters({ ...filters, status })}
              options={statusOptions}
              placeholder="Any"
              getOptionDotClassName={getStatusDotClassName}
            />
          </div>
        </div>
        <div className="mt-6">
          {filteredReports.length > 0 ? (
            <div className="overflow-x-auto overflow-y-visible border border-slate-200 rounded-xl">
              <table className="min-w-[980px] w-full border-collapse">
                <thead className="bg-[#CFE8E8]">
                  <tr>
                    <th className="text-left text-[12px] font-bold text-[#073D44] px-4 py-3 border-b border-[#073D44]/15">Project</th>
                    <th className="text-left text-[12px] font-bold text-[#073D44] px-4 py-3 border-b border-[#073D44]/15">Published By</th>
                    <th className="text-left text-[12px] font-bold text-[#073D44] px-4 py-3 border-b border-[#073D44]/15">Week</th>
                    <th className="text-left text-[12px] font-bold text-[#073D44] px-4 py-3 border-b border-[#073D44]/15">Month</th>
                    <th className="text-left text-[12px] font-bold text-[#073D44] px-4 py-3 border-b border-[#073D44]/15">Status</th>
                    <th className="text-left text-[12px] font-bold text-[#073D44] px-4 py-3 border-b border-[#073D44]/15">Last Updated</th>
                    <th className="text-right text-[12px] font-bold text-[#073D44] px-4 py-3 border-b border-[#073D44]/15">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 border-b border-slate-100">
                        <span className="text-[13px] font-semibold text-slate-900">
                          {getProjectLabel(r)}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100">
                        <span className="text-[13px] font-semibold text-slate-900 block max-w-[320px] truncate">
                          {getPublishedByName(r)}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 text-[13px] text-slate-700">
                        Week {r.weekOfMonth}
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 text-[13px] text-slate-700">
                        {getMonthName(r.month)}
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100">
                        <span
                          className={`inline-flex items-center text-[10px] font-bold uppercase px-2 py-0.5 rounded ring-1 ${
                            r.status === ReportStatus.PUBLISHED
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                              : r.status === ReportStatus.APPROVED
                                ? 'bg-indigo-50 text-indigo-700 ring-indigo-100'
                                : 'bg-slate-100 text-slate-600 ring-slate-200'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 text-[13px] text-slate-600">
                        {formatISODate(r.updatedAt)}
                      </td>
                      <td className="px-4 py-3 border-b border-slate-100 text-right">
                        <div className="relative inline-flex items-center justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              const nextId = openMenuId === r.id ? null : r.id;
                              if (!nextId) {
                                setOpenMenuId(null);
                                setMenuPos(null);
                                return;
                              }
                              menuAnchorRef.current = e.currentTarget;
                              setOpenMenuId(nextId);
                              updateMenuPosition();
                            }}
                            className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                            aria-label="Report actions"
                          >
                            <KebabIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-[13px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-10 text-center">
              No reports found for the selected filters.
            </div>
          )}
        </div>
      </section>
      {dropdownNode}
    </div>
  );
};

export default WeeklyReportView;
