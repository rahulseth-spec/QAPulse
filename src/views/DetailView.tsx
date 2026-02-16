import React, { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { WeeklyReport, Project, User, ReportStatus, HealthStatus, LoadStatus, GoalRow, ThreadRow, ExecutionReadinessSlide } from '../types';
import { formatLocalISODate, getMonthName, parseISODateToLocal } from '../utils';

interface DetailProps {
  reports: WeeklyReport[];
  projects: Project[];
  user: User;
  users: User[];
  onUpdate: (report: WeeklyReport) => void;
  onDelete: (id: string) => void;
}

const DetailView: React.FC<DetailProps> = ({ reports, projects, user, users, onUpdate, onDelete }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const report = reports.find(r => r.id === id);

  if (!report) return <div className="text-center py-20 text-slate-400 font-bold">Report not found.</div>;

  const project = projects.find(p => p.id === report.projectId);
  const isOverall = report.scope === 'OVERALL' || (report.executionReadinessSlides?.length ?? 0) > 0 || !report.projectId;
  const headerProjectName = isOverall ? 'All Projects' : (project?.name || 'Project');
  const headerProjectCode = isOverall ? 'ALL' : (project?.code || '');
  const executionSlidesBase: ExecutionReadinessSlide[] = isOverall
    ? (report.executionReadinessSlides?.length ? report.executionReadinessSlides : [])
    : [
        {
          projectId: report.projectId || '',
          projectNameOverride: '',
          capacity: report.capacity,
          strength: report.strength,
          sprintHealth: report.sprintHealth,
          bottlenecks: report.bottlenecks,
          decisions: report.decisions,
        },
      ];
  const executionSlidesToRender: ExecutionReadinessSlide[] = executionSlidesBase.length
    ? executionSlidesBase
    : [
        {
          projectId: report.projectId || '',
          projectNameOverride: '',
          capacity: report.capacity,
          strength: report.strength,
          sprintHealth: report.sprintHealth,
          bottlenecks: report.bottlenecks,
          decisions: report.decisions,
        },
      ];
  const isOwner = report.createdBy === user.id;

  useEffect(() => {
    const state = location.state as any;
    if (state?.autoPrint) {
      window.setTimeout(() => window.print(), 0);
      navigate(`/report/${report.id}`, { replace: true, state: null });
      return;
    }
    if (state?.autoPpt) {
      window.setTimeout(() => { handleExportPPT(); }, 0);
      navigate(`/report/${report.id}`, { replace: true, state: null });
    }
  }, [location.key]);

  const pillBase = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-wide ring-1 ring-inset';

  const getHealthPill = (value: HealthStatus | 'NA') => {
    if (value === 'NA') return { label: 'N/A', ring: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' };
    if (value === HealthStatus.GREEN) return { label: 'GREEN', ring: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' };
    if (value === HealthStatus.YELLOW) return { label: 'YELLOW', ring: 'bg-amber-50 text-amber-900 ring-amber-200', dot: 'bg-amber-500' };
    return { label: 'RED', ring: 'bg-rose-50 text-rose-900 ring-rose-200', dot: 'bg-rose-500' };
  };

  const getLoadStatusPill = (value: LoadStatus) => {
    if (value === LoadStatus.NORMAL) return { label: 'NORMAL', ring: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' };
    if (value === LoadStatus.UNDERUTILIZED) return { label: 'UNDERUTILIZED', ring: 'bg-amber-50 text-amber-900 ring-amber-200', dot: 'bg-amber-500' };
    return { label: 'OVERLOADED', ring: 'bg-rose-50 text-rose-900 ring-rose-200', dot: 'bg-rose-500' };
  };

  const getThreadStatusPill = (value: string) => {
    if (value === 'COMPLETED') return { label: 'COMPLETED', ring: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' };
    if (value === 'IN_PROGRESS') return { label: 'IN PROGRESS', ring: 'bg-amber-50 text-amber-900 ring-amber-200', dot: 'bg-amber-500' };
    if (value === 'BLOCKED') return { label: 'BLOCKED', ring: 'bg-rose-50 text-rose-900 ring-rose-200', dot: 'bg-rose-500' };
    return { label: 'NOT STARTED', ring: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' };
  };

  const slugify = (s: string) =>
    (s || 'weekly_snapshot')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const getUserName = (userId: string) => users.find(u => u.id === userId)?.name || 'Unknown User';

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

    if (!Array.isArray(r.goals) || r.goals.length < 1) return false;
    if (r.goals.slice(0, 1).some(g => !g.goal.trim() || !g.successMetric.trim())) return false;
    if (
      r.goals.slice(1).some(g => {
        const any = g.goal.trim() || g.successMetric.trim();
        return any && (!g.goal.trim() || !g.successMetric.trim());
      })
    ) {
      return false;
    }

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

    if (!Array.isArray(r.bottlenecks) || r.bottlenecks.length < 3) return false;
    if (r.bottlenecks.slice(0, 3).some(b => !b.trim())) return false;

    if (!Array.isArray(r.decisions) || r.decisions.length < 3) return false;
    if (r.decisions.slice(0, 3).some(d => !d.decisionText.trim())) return false;

    if (!Array.isArray(r.threads) || r.threads.length < 1) return false;
    if (r.threads.slice(0, 1).some(t => !t.product?.trim() || !t.thread.trim() || !t.ownerId || !t.status)) return false;
    if (
      r.threads.slice(1).some(t => {
        const any = (t.product || '').trim() || t.thread.trim() || t.ownerId || t.status;
        return any && (!t.product?.trim() || !t.thread.trim() || !t.ownerId || !t.status);
      })
    ) {
      return false;
    }

    return true;
  };

  const handlePublish = () => {
    if (!isOwner) return;
    if (!isPublishable(report)) return;
    onUpdate({ ...report, status: ReportStatus.PUBLISHED, publishedBy: user.id, updatedBy: user.id, updatedAt: new Date().toISOString() });
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleExportPPT = async () => {
    const mod = await import('pptxgenjs');
    const PptxGenJS = (mod as any).default || (mod as any);

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';

    const title = report.title || 'Weekly Snapshot';
    const fileName = `${slugify(title)}.pptx`;

    function chunk<T>(arr: T[], size: number): T[][] {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    }

    const slide1 = pptx.addSlide();
    slide1.background = { color: 'FFFFFF' };
    slide1.addText(title, { x: 0.6, y: 0.3, w: 12.2, h: 0.6, fontFace: 'Calibri', fontSize: 22, bold: true, color: '0F172A' });
    slide1.addText('Goals & Team Health', { x: 0.6, y: 1.05, w: 12.2, h: 0.4, fontFace: 'Calibri', fontSize: 14, bold: true, color: '0F172A' });
    const goalChunks = chunk<GoalRow>(report.goals || [], 10);
    const goalLines1 = (goalChunks[0] || []).map((g, i) => `${i + 1}. ${g.goal} — ${g.successMetric} (Health: ${g.health}, Conf: ${g.confidence})`).join('\n');
    slide1.addText(goalLines1 || 'No goals', { x: 0.6, y: 1.5, w: 12.2, h: 5.6, fontFace: 'Calibri', fontSize: (goalChunks[0]?.length || 0) > 7 ? 10 : 12, color: '334155' });

    goalChunks.slice(1).forEach((chunkGoals, chunkIdx) => {
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };
      slide.addText(title, { x: 0.6, y: 0.3, w: 12.2, h: 0.6, fontFace: 'Calibri', fontSize: 22, bold: true, color: '0F172A' });
      slide.addText(`Goals & Team Health (cont.)`, { x: 0.6, y: 1.05, w: 12.2, h: 0.4, fontFace: 'Calibri', fontSize: 14, bold: true, color: '0F172A' });
      const lines = chunkGoals.map((g, i) => `${chunkIdx * 10 + i + 1}. ${g.goal} — ${g.successMetric} (Health: ${g.health}, Conf: ${g.confidence})`).join('\n');
      slide.addText(lines || 'No goals', { x: 0.6, y: 1.5, w: 12.2, h: 5.6, fontFace: 'Calibri', fontSize: chunkGoals.length > 7 ? 10 : 12, color: '334155' });
    });

    const executionSlides: ExecutionReadinessSlide[] =
      isOverall
        ? (report.executionReadinessSlides?.length ? report.executionReadinessSlides : [])
        : [
            {
              projectId: report.projectId,
              sprintHealth: report.sprintHealth,
              capacity: report.capacity,
              strength: report.strength,
              bottlenecks: report.bottlenecks,
              decisions: report.decisions,
            },
          ];
    const ensuredSlides: ExecutionReadinessSlide[] = executionSlides.length ? executionSlides : [
      {
        projectId: report.projectId,
        sprintHealth: report.sprintHealth,
        capacity: report.capacity,
        strength: report.strength,
        bottlenecks: report.bottlenecks,
        decisions: report.decisions,
      },
    ];

    ensuredSlides.forEach((s) => {
      const slideProject = projects.find(p => p.id === s.projectId);
      const slideTitleProjectName = s.projectNameOverride || slideProject?.name || 'Project';
      const slide2 = pptx.addSlide();
      slide2.background = { color: 'FFFFFF' };
      slide2.addText(`${slideTitleProjectName} Execution Readiness & Friction`, { x: 0.6, y: 0.3, w: 12.2, h: 0.6, fontFace: 'Calibri', fontSize: 20, bold: true, color: '0F172A' });
      const left = [
        `Sprint Health`,
        `• Sprint start date: ${s.sprintHealth?.startDate || 'N/A'}`,
        `• Sprint goal clarity: ${s.sprintHealth?.goalClarity || 'N/A'}`,
        `• Sprint readiness: ${s.sprintHealth?.readiness || 'N/A'}`,
        ``,
        `Team Health (Capacity)`,
        `• Planned team hours: ${s.capacity?.plannedHours ?? 'N/A'}`,
        `• Committed team hours: ${s.capacity?.committedHours ?? 'N/A'}`,
        `• Surplus/Deficit (hrs): ${s.capacity?.surplusDeficitHours ?? 'N/A'}`,
        `• Load status: ${s.capacity?.loadStatus ?? 'N/A'}`,
        ``,
        `Team Strength`,
        `• Active contributors: ${s.strength?.activeContributorNames || 'N/A'}`,
        `• Critical role gaps: ${s.strength?.criticalRoleGaps ? 'Yes' : 'No'}`,
        ``,
        `UE/D Health`,
        `• Last discussion: ${report.uedHealth?.lastDiscussion || 'N/A'}`,
        `• Days since last: ${report.uedHealth?.daysSinceLast || 'N/A'}`,
        `• Next scheduled: ${report.uedHealth?.nextScheduled || 'N/A'}`,
        `• Data available: ${report.uedHealth?.dataAvailable ? 'Yes' : 'No'}`,
        `• Status: ${report.uedHealth?.status || 'N/A'}`,
      ].join('\n');
      slide2.addText(left, { x: 0.6, y: 1.1, w: 6.1, h: 6.2, fontFace: 'Calibri', fontSize: 12, color: '334155' });
      const rightBottlenecks = (s.bottlenecks?.length ? s.bottlenecks : report.bottlenecks) || [];
      const rightDecisions = (s.decisions?.length ? s.decisions : report.decisions) || [];
      const right = [
        `Bottlenecks`,
        ...rightBottlenecks.map((b: string, i: number) => `${i + 1}. ${b || 'N/A'}`),
        ``,
        `Decisions Pending`,
        ...rightDecisions.map((d, i: number) => `${i + 1}. ${d.decisionText || 'N/A'}`),
      ].join('\n');
      slide2.addText(right, { x: 7.0, y: 1.1, w: 5.8, h: 6.2, fontFace: 'Calibri', fontSize: 12, color: '334155' });
    });

    const threadChunks = chunk<ThreadRow>(report.threads || [], 10);
    (threadChunks.length ? threadChunks : [[]]).forEach((chunkThreads, chunkIdx) => {
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };
      slide.addText('Top Team Threads (Cognitive Load)', { x: 0.6, y: 0.3, w: 12.2, h: 0.6, fontFace: 'Calibri', fontSize: 20, bold: true, color: '0F172A' });
      const lines = chunkThreads.map((t, i) => `${chunkIdx * 10 + i + 1}. ${t.product || headerProjectCode || 'Product'} — ${t.thread} — ${getUserName(t.ownerId)} (${t.status})`).join('\n');
      slide.addText(lines || 'No threads', { x: 0.6, y: 1.1, w: 12.2, h: 6.4, fontFace: 'Calibri', fontSize: chunkThreads.length > 8 ? 10 : 12, color: '334155' });
    });

    await pptx.writeFile({ fileName });
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
          <div className="px-6 py-5 bg-gradient-to-r from-[#073D44] to-[#407B7E]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-[28px] leading-[36px] font-bold tracking-tight text-white">{report.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-white/80 font-medium">
                  <span className="bg-white/15 border border-white/20 px-2 py-0.5 rounded text-white uppercase font-bold tracking-widest">{headerProjectCode}</span>
                  <span>•</span>
                  <span>{getMonthName(report.month)} - Week {report.weekOfMonth}</span>
                  <span>•</span>
                  <span>{report.startDate} – {report.endDate}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest ${
                  report.status === ReportStatus.PUBLISHED ? 'bg-white text-[#073D44]' : 'bg-white/15 text-white border border-white/20'
                }`}>
                  {report.status}
                </span>
              </div>
            </div>
            <div className="print-hide mt-5 flex flex-wrap gap-3">
              <button
                onClick={handleExportPDF}
                className="h-10 px-4 rounded-xl bg-white text-[#073D44] font-semibold text-[13px] hover:bg-white/90 transition-colors"
              >
                Download PDF
              </button>
              <button
                onClick={handleExportPPT}
                className="h-10 px-4 rounded-xl bg-white text-[#073D44] font-semibold text-[13px] hover:bg-white/90 transition-colors"
              >
                Download PPT
              </button>
              {isOwner && (
                <button
                  onClick={() => { if(window.confirm('Delete this report?')) { onDelete(report.id); navigate('/'); }}}
                  className="h-10 px-4 rounded-xl bg-white text-red-700 font-semibold text-[13px] hover:bg-white/90 transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div id="printable-report" className="max-w-5xl mx-auto space-y-8">
        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden" style={{ breakAfter: 'page' }}>
          <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
            <div className="text-[16px] font-semibold text-[#073D44]">Goals &amp; Team Health</div>
          </div>
          <div className="p-6">
            <div className="text-[14px] font-semibold text-slate-900">{report.title}</div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-[#CFE8E8]">
                  <tr className="text-[11px] text-[#073D44]">
                    <th className="px-3 py-2 font-semibold">Goal</th>
                    <th className="px-3 py-2 font-semibold">Success Metric</th>
                    <th className="px-3 py-2 font-semibold w-[160px]">Health</th>
                    <th className="px-3 py-2 font-semibold w-[160px]">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {report.goals.map((g, idx) => (
                    <tr key={idx} className="border-t border-slate-200 text-[12px] text-slate-800">
                      <td className="px-3 py-2">{g.goal}</td>
                      <td className="px-3 py-2">{g.successMetric}</td>
                      <td className="px-3 py-2">
                        {(() => {
                          const pill = getHealthPill(g.health);
                          return (
                            <span className={`${pillBase} ${pill.ring}`}>
                              <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                              {pill.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`${pillBase} bg-slate-100 text-slate-800 ring-slate-200`}>
                          {g.confidence === 'MED' ? 'MEDIUM' : g.confidence}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {executionSlidesToRender.map((s, slideIdx) => {
          const slideProject = projects.find(p => p.id === s.projectId);
          const slideTitle = `${s.projectNameOverride || slideProject?.name || 'Project'} Execution Readiness & Friction`;
          return (
            <div key={`${s.projectId || 'overall'}-${slideIdx}`} className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden" style={{ breakAfter: 'page' }}>
              <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
                <div className="text-[16px] font-semibold text-[#073D44]">{slideTitle}</div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-6 text-[12px] text-slate-700">
                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">Sprint Health</div>
                      <div className="grid grid-cols-1 gap-1">
                        <div>Sprint start date: <span className="font-semibold text-slate-900">{s.sprintHealth.startDate}</span></div>
                        <div className="flex items-center gap-2">
                          <span>Sprint goal clarity:</span>
                          {(() => {
                            const pill = getHealthPill(s.sprintHealth.goalClarity);
                            return (
                              <span className={`${pillBase} ${pill.ring}`}>
                                <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                                {pill.label}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2">
                          <span>Sprint readiness:</span>
                          {(() => {
                            const pill = getHealthPill(s.sprintHealth.readiness);
                            return (
                              <span className={`${pillBase} ${pill.ring}`}>
                                <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                                {pill.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">Team Health (Capacity)</div>
                      <div className="grid grid-cols-1 gap-1">
                        <div>Planned team hours: <span className="font-semibold text-slate-900">{s.capacity.plannedHours}</span></div>
                        <div>Committed team hours: <span className="font-semibold text-slate-900">{s.capacity.committedHours}</span></div>
                        <div>Surplus/Deficit (hrs): <span className="font-semibold text-slate-900">{s.capacity.surplusDeficitHours}</span></div>
                        <div className="flex items-center gap-2">
                          <span>Load status:</span>
                          {(() => {
                            const pill = getLoadStatusPill(s.capacity.loadStatus);
                            return (
                              <span className={`${pillBase} ${pill.ring}`}>
                                <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                                {pill.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">Team Strength</div>
                      <div className="grid grid-cols-1 gap-1">
                        <div>Active contributors: <span className="font-semibold text-slate-900">{s.strength.activeContributorNames || s.strength.activeContributors}</span></div>
                        <div>Critical role gaps: <span className="font-semibold text-slate-900">{s.strength.criticalRoleGaps ? 'Yes' : 'No'}</span></div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">UE/D Health</div>
                      <div className="grid grid-cols-1 gap-1">
                        <div>Last discussion: <span className="font-semibold text-slate-900">{report.uedHealth.lastDiscussion}</span></div>
                        <div>Days since last: <span className="font-semibold text-slate-900">{report.uedHealth.daysSinceLast}</span></div>
                        <div>Next scheduled: <span className="font-semibold text-slate-900">{report.uedHealth.nextScheduled}</span></div>
                        <div>Data available: <span className="font-semibold text-slate-900">{report.uedHealth.dataAvailable ? 'Yes' : 'No'}</span></div>
                        <div className="flex items-center gap-2">
                          <span>Status:</span>
                          {(() => {
                            const pill = getHealthPill(report.uedHealth.status);
                            return (
                              <span className={`${pillBase} ${pill.ring}`}>
                                <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                                {pill.label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8 text-[12px] text-slate-700">
                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">Bottlenecks</div>
                      <ol className="list-decimal ml-5 space-y-1">
                        {(s.bottlenecks?.length ? s.bottlenecks : report.bottlenecks).map((b, idx) => (
                          <li key={idx} className="text-slate-800">{b || 'N/A'}</li>
                        ))}
                      </ol>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[12px] font-bold text-slate-900 tracking-tight">Decisions Pending</div>
                      <ol className="list-decimal ml-5 space-y-1">
                        {(s.decisions?.length ? s.decisions : report.decisions).map((d, idx) => (
                          <li key={idx} className="text-slate-800">{d.decisionText || 'N/A'}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden" style={{ breakAfter: 'auto' }}>
          <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
            <div className="text-[16px] font-semibold text-[#073D44]">Top Team Threads (Cognitive Load)</div>
          </div>
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-[#CFE8E8]">
                  <tr className="text-[11px] text-[#073D44]">
                    <th className="px-3 py-2 font-semibold w-[160px]">Product</th>
                    <th className="px-3 py-2 font-semibold">Thread</th>
                    <th className="px-3 py-2 font-semibold w-[180px]">Owner</th>
                    <th className="px-3 py-2 font-semibold w-[180px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.threads.map((t, idx) => (
                    <tr key={idx} className="border-t border-slate-200 text-[12px] text-slate-800">
                      <td className="px-3 py-2">{t.product || headerProjectCode || ''}</td>
                      <td className="px-3 py-2">{t.thread}</td>
                      <td className="px-3 py-2">{getUserName(t.ownerId)}</td>
                      <td className="px-3 py-2">
                        {(() => {
                          const pill = getThreadStatusPill(t.status);
                          return (
                            <span className={`${pillBase} ${pill.ring}`}>
                              <span className={`h-2 w-2 rounded-full ${pill.dot}`} />
                              {pill.label}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailView;
