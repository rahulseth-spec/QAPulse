import React, { useState } from 'react';
import { WeeklyReport, Project, User, ReportStatus } from '../types';
import { Link } from 'react-router-dom';
import { formatISODate, getMonthName } from '../utils';
import { ThemedSelect, type ThemedSelectOption } from '../components/ThemedSelect';

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

  const pillBase = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest ring-1 ring-inset';
  const getStatusPill = (state: 'PUBLISHED' | 'NOT_PUBLISHED' | 'MISSING') => {
    if (state === 'PUBLISHED') return { label: 'Published', className: `${pillBase} bg-emerald-50 text-emerald-700 ring-emerald-200` };
    if (state === 'NOT_PUBLISHED') return { label: 'Not published', className: `${pillBase} bg-amber-50 text-amber-900 ring-amber-200` };
    return { label: 'Missing', className: `${pillBase} bg-rose-50 text-rose-700 ring-rose-200` };
  };

  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(String(defaultYear));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(defaultMonth));

  const availableYears = Array.from(new Set<number>(reports.map(r => r.year))).sort((a, b) => b - a);
  const yearNumbers = availableYears.length > 0 ? availableYears : [defaultYear];

  const yearOptions: ThemedSelectOption[] = yearNumbers.map(y => ({ value: String(y), label: String(y) }));
  const monthOptions: ThemedSelectOption[] = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return { value: String(m), label: getMonthName(m) };
  });

  const filterButtonClassName =
    "h-10 text-[12px] px-3 pr-9 rounded-xl bg-white/65 border border-[#073D44]/25 text-[#073D44] font-semibold focus:ring-4 focus:ring-[#407B7E]/20 focus:border-[#407B7E]";

  const isPublishedLike = (s: ReportStatus) => s === ReportStatus.PUBLISHED || s === ReportStatus.APPROVED;
  const getWeeklyState = (projectId: string, weekOfMonth: 1 | 2 | 3 | 4 | 5) => {
    const selectedYearNumber = Number(selectedYear);
    const selectedMonthNumber = Number(selectedMonth);
    const candidates = reports.filter(r =>
      r.projectId === projectId &&
      r.year === selectedYearNumber &&
      r.month === selectedMonthNumber &&
      r.weekOfMonth === weekOfMonth
    );

    const publishedCandidate = [...candidates]
      .filter(r => isPublishedLike(r.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    const latestCandidate = [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const chosen = publishedCandidate || latestCandidate;

    const state: 'PUBLISHED' | 'NOT_PUBLISHED' | 'MISSING' =
      !chosen ? 'MISSING' : (isPublishedLike(chosen.status) ? 'PUBLISHED' : 'NOT_PUBLISHED');

    return { state, report: chosen };
  };

  const weeks: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];
  const monthlyRows = userProjects.map(project => {
    const byWeek = weeks.reduce((acc, week) => {
      acc[week] = getWeeklyState(project.id, week);
      return acc;
    }, {} as Record<1 | 2 | 3 | 4 | 5, { state: 'PUBLISHED' | 'NOT_PUBLISHED' | 'MISSING'; report?: WeeklyReport }>);

    return { project, byWeek };
  });

  const monthlyCounts = weeks.reduce(
    (acc, week) => {
      for (const row of monthlyRows) {
        const state = row.byWeek[week].state;
        if (state === 'PUBLISHED') acc.published += 1;
        else if (state === 'NOT_PUBLISHED') acc.notPublished += 1;
        else acc.missing += 1;
      }
      return acc;
    },
    { published: 0, notPublished: 0, missing: 0 }
  );

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
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/70 mb-1">Published this month</div>
            <div className="text-[24px] leading-[32px] font-bold">{monthlyCounts.published}</div>
          </div>
          <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/70 mb-1">Missing this month</div>
            <div className="text-[24px] leading-[32px] font-bold">{monthlyCounts.missing}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-[#073D44] tracking-tight">Monthly Report Status</div>
                <div className="mt-0.5 text-[12px] text-[#073D44]/70 font-semibold">{getMonthName(Number(selectedMonth))} {selectedYear}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-[104px]">
                  <ThemedSelect
                    value={selectedYear}
                    onChange={setSelectedYear}
                    options={yearOptions}
                    disabled={yearOptions.length <= 1}
                    buttonClassName={filterButtonClassName}
                  />
                </div>
                <div className="w-[128px]">
                  <ThemedSelect
                    value={selectedMonth}
                    onChange={setSelectedMonth}
                    options={monthOptions}
                    buttonClassName={filterButtonClassName}
                  />
                </div>
              </div>
            </div>
            <div className="p-6">
              {monthlyRows.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="min-w-[860px] w-full border-collapse">
                    <thead className="bg-[#CFE8E8]">
                      <tr>
                        <th className="text-left text-[12px] font-bold text-[#073D44] px-4 py-3 border-b border-[#073D44]/15">Project</th>
                        {weeks.map(w => (
                          <th key={w} className="text-left text-[12px] font-bold text-[#073D44] px-4 py-3 border-b border-[#073D44]/15">Week {w}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyRows.map(({ project, byWeek }) => (
                        <tr key={project.id} className="border-t border-slate-200 text-[13px] text-slate-800">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{project.name}</div>
                            <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest">{project.code}</div>
                          </td>
                          {weeks.map(w => {
                            const { state, report } = byWeek[w];
                            const pill = getStatusPill(state);
                            return (
                              <td key={w} className="px-4 py-3">
                                <span className={pill.className}>{pill.label}</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-10 text-slate-500">
                  No projects assigned to your account.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-[18px] leading-[28px] font-bold text-slate-900 tracking-tight">Recent Reports</h3>
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

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 uppercase tracking-wider text-xs">Quick Actions</h3>
            <div className="space-y-3">
              <Link to="/create" className="h-12 px-4 flex items-center gap-3 w-full bg-[#CFE8E8] text-[#073D44] rounded-xl font-semibold text-[14px] border border-[#073D44]/20 hover:bg-[#BFE0E0] transition-colors">
                <span className="w-8 h-8 rounded-lg bg-white/50 border border-[#073D44]/15 flex items-center justify-center">
                  <PlusIcon className="text-[#073D44]" />
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
