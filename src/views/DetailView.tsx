import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WeeklyReport, Project, User, ReportStatus, HealthStatus, LoadStatus, GoalRow, ThreadRow } from '../types';
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
  const report = reports.find(r => r.id === id);

  if (!report) return <div className="text-center py-20 text-slate-400 font-bold">Report not found.</div>;

  const project = projects.find(p => p.id === report.projectId);

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

    if (!r.uedHealth) return false;
    if (!r.uedHealth.lastDiscussion.trim()) return false;
    if (!r.uedHealth.daysSinceLast.trim()) return false;
    if (!r.uedHealth.nextScheduled.trim()) return false;
    if (r.uedHealth.status === 'NA' || !r.uedHealth.status) return false;

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
    if (!isPublishable(report)) return;
    onUpdate({ ...report, status: ReportStatus.PUBLISHED, publishedBy: user.id, updatedAt: new Date().toISOString() });
  };

  const handleCreateRevision = () => {
    const revision: WeeklyReport = {
      ...report,
      id: Math.random().toString(36).substr(2, 9),
      status: ReportStatus.DRAFT,
      revisionOf: report.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user.id,
      publishedBy: undefined,
    };
    onUpdate(revision);
    navigate(`/edit/${revision.id}`);
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

    const slide2 = pptx.addSlide();
    slide2.background = { color: 'FFFFFF' };
    slide2.addText(`${project?.name || 'Project'} Execution Readiness & Friction`, { x: 0.6, y: 0.3, w: 12.2, h: 0.6, fontFace: 'Calibri', fontSize: 20, bold: true, color: '0F172A' });
    const left = [
      `Sprint Health`,
      `• Sprint start date: ${report.sprintHealth?.startDate || 'N/A'}`,
      `• Sprint goal clarity: ${report.sprintHealth?.goalClarity || 'N/A'}`,
      `• Sprint readiness: ${report.sprintHealth?.readiness || 'N/A'}`,
      ``,
      `Team Health (Capacity)`,
      `• Planned team hours: ${report.capacity?.plannedHours ?? 'N/A'}`,
      `• Committed team hours: ${report.capacity?.committedHours ?? 'N/A'}`,
      `• Surplus/Deficit (hrs): ${report.capacity?.surplusDeficitHours ?? 'N/A'}`,
      `• Load status: ${report.capacity?.loadStatus ?? 'N/A'}`,
      ``,
      `Team Strength`,
      `• Active contributors: ${report.strength?.activeContributorNames || 'N/A'}`,
      `• Critical role gaps: ${report.strength?.criticalRoleGaps ? 'Yes' : 'No'}`,
      ``,
      `UE/D Health`,
      `• Last discussion: ${report.uedHealth?.lastDiscussion || 'N/A'}`,
      `• Days since last: ${report.uedHealth?.daysSinceLast || 'N/A'}`,
      `• Next scheduled: ${report.uedHealth?.nextScheduled || 'N/A'}`,
      `• Data available: ${report.uedHealth?.dataAvailable ? 'Yes' : 'No'}`,
      `• Status: ${report.uedHealth?.status || 'N/A'}`,
    ].join('\n');
    slide2.addText(left, { x: 0.6, y: 1.1, w: 6.1, h: 6.2, fontFace: 'Calibri', fontSize: 12, color: '334155' });
    const right = [
      `Bottlenecks`,
      ...report.bottlenecks.map((b, i) => `${i + 1}. ${b || 'N/A'}`),
      ``,
      `Decisions Pending`,
      ...report.decisions.map((d, i) => `${i + 1}. ${d.decisionText || 'N/A'}`),
    ].join('\n');
    slide2.addText(right, { x: 7.0, y: 1.1, w: 5.8, h: 6.2, fontFace: 'Calibri', fontSize: 12, color: '334155' });

    const threadChunks = chunk<ThreadRow>(report.threads || [], 10);
    (threadChunks.length ? threadChunks : [[]]).forEach((chunkThreads, chunkIdx) => {
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };
      slide.addText('Top Team Threads (Cognitive Load)', { x: 0.6, y: 0.3, w: 12.2, h: 0.6, fontFace: 'Calibri', fontSize: 20, bold: true, color: '0F172A' });
      const lines = chunkThreads.map((t, i) => `${chunkIdx * 10 + i + 1}. ${t.product || project?.code || 'Product'} — ${t.thread} — ${getUserName(t.ownerId)} (${t.status})`).join('\n');
      slide.addText(lines || 'No threads', { x: 0.6, y: 1.1, w: 12.2, h: 6.4, fontFace: 'Calibri', fontSize: chunkThreads.length > 8 ? 10 : 12, color: '334155' });
    });

    await pptx.writeFile({ fileName });
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[28px] leading-[36px] font-bold tracking-tight text-slate-900">{report.title}</h1>
            <div className="mt-2 flex items-center gap-3 text-[12px] text-slate-500 font-medium">
              <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 uppercase font-bold tracking-widest">{project?.code}</span>
              <span>•</span>
              <span>{getMonthName(report.month)} - Week {report.weekOfMonth}</span>
              <span>•</span>
              <span>{report.startDate} – {report.endDate}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-widest ${
              report.status === ReportStatus.PUBLISHED ? 'bg-[#073D44] text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {report.status}
            </span>
          </div>
        </div>

        <div className="print-hide flex flex-wrap gap-3 border border-slate-200 bg-white rounded-[16px] p-3 shadow-sm">
          <button
            onClick={() => navigate(-1)}
            className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors"
          >
            Back
          </button>
          {report.status === ReportStatus.DRAFT && (
            <button
              onClick={handlePublish}
              disabled={!isPublishable(report)}
              className={`h-10 px-4 rounded-xl font-semibold text-[13px] transition-colors ${
                isPublishable(report) ? 'bg-[#073D44] text-white hover:bg-[#0A4A52]' : 'bg-slate-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              Publish
            </button>
          )}
          {report.status === ReportStatus.DRAFT && (
            <button
              onClick={() => navigate(`/edit/${report.id}`)}
              className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors"
            >
              Edit Draft
            </button>
          )}
          {report.status === ReportStatus.PUBLISHED && (
            <button
              onClick={handleCreateRevision}
              className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors"
            >
              Create Revision
            </button>
          )}
          <button
            onClick={handleExportPDF}
            className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors"
          >
            Download PDF
          </button>
          <button
            onClick={handleExportPPT}
            className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors"
          >
            Download PPT
          </button>
          <button
            onClick={() => { if(window.confirm('Delete this report?')) { onDelete(report.id); navigate('/'); }}}
            className="h-10 px-4 rounded-xl text-red-600 font-semibold text-[13px] hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      <div id="printable-report" className="max-w-5xl mx-auto space-y-8">
        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden" style={{ breakAfter: 'page' }}>
          <div className="p-6">
            <div className="text-[16px] font-semibold text-slate-900">{report.title}</div>
            <div className="mt-2 h-px bg-slate-200" />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr className="text-[11px] text-slate-600">
                    <th className="px-3 py-2 font-semibold">Goal</th>
                    <th className="px-3 py-2 font-semibold">Success Metric</th>
                    <th className="px-3 py-2 font-semibold w-[140px]">Health</th>
                    <th className="px-3 py-2 font-semibold w-[140px]">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {report.goals.map((g, idx) => (
                    <tr key={idx} className="border-t border-slate-200 text-[12px] text-slate-800">
                      <td className="px-3 py-2">{g.goal}</td>
                      <td className="px-3 py-2">{g.successMetric}</td>
                      <td className="px-3 py-2">{g.health}</td>
                      <td className="px-3 py-2">{g.confidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden" style={{ breakAfter: 'page' }}>
          <div className="p-6">
            <div className="text-[18px] font-semibold text-slate-900">{project?.name || 'Project'} Execution Readiness &amp; Friction</div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-6 text-[12px] text-slate-700">
                <div className="space-y-2">
                  <div className="text-[12px] font-bold text-slate-900 tracking-tight">Sprint Health</div>
                  <div className="grid grid-cols-1 gap-1">
                    <div>Sprint start date: <span className="font-semibold text-slate-900">{report.sprintHealth.startDate}</span></div>
                    <div>Sprint goal clarity: <span className="font-semibold text-slate-900">{report.sprintHealth.goalClarity}</span></div>
                    <div>Sprint readiness: <span className="font-semibold text-slate-900">{report.sprintHealth.readiness}</span></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[12px] font-bold text-slate-900 tracking-tight">Team Health (Capacity)</div>
                  <div className="grid grid-cols-1 gap-1">
                    <div>Planned team hours: <span className="font-semibold text-slate-900">{report.capacity.plannedHours}</span></div>
                    <div>Committed team hours: <span className="font-semibold text-slate-900">{report.capacity.committedHours}</span></div>
                    <div>Surplus/Deficit (hrs): <span className="font-semibold text-slate-900">{report.capacity.surplusDeficitHours}</span></div>
                    <div>Load status: <span className="font-semibold text-slate-900">{report.capacity.loadStatus}</span></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[12px] font-bold text-slate-900 tracking-tight">Team Strength</div>
                  <div className="grid grid-cols-1 gap-1">
                    <div>Active contributors: <span className="font-semibold text-slate-900">{report.strength.activeContributorNames || report.strength.activeContributors}</span></div>
                    <div>Critical role gaps: <span className="font-semibold text-slate-900">{report.strength.criticalRoleGaps ? 'Yes' : 'No'}</span></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[12px] font-bold text-slate-900 tracking-tight">UE/D Health</div>
                  <div className="grid grid-cols-1 gap-1">
                    <div>Last discussion: <span className="font-semibold text-slate-900">{report.uedHealth.lastDiscussion}</span></div>
                    <div>Days since last: <span className="font-semibold text-slate-900">{report.uedHealth.daysSinceLast}</span></div>
                    <div>Next scheduled: <span className="font-semibold text-slate-900">{report.uedHealth.nextScheduled}</span></div>
                    <div>Data available: <span className="font-semibold text-slate-900">{report.uedHealth.dataAvailable ? 'Yes' : 'No'}</span></div>
                    <div>Status: <span className="font-semibold text-slate-900">{report.uedHealth.status}</span></div>
                  </div>
                </div>
              </div>

              <div className="space-y-8 text-[12px] text-slate-700">
                <div className="space-y-2">
                  <div className="text-[12px] font-bold text-slate-900 tracking-tight">Bottlenecks</div>
                  <ol className="list-decimal ml-5 space-y-1">
                    {report.bottlenecks.map((b, idx) => (
                      <li key={idx} className="text-slate-800">{b || 'N/A'}</li>
                    ))}
                  </ol>
                </div>
                <div className="space-y-2">
                  <div className="text-[12px] font-bold text-slate-900 tracking-tight">Decisions Pending</div>
                  <ol className="list-decimal ml-5 space-y-1">
                    {report.decisions.map((d, idx) => (
                      <li key={idx} className="text-slate-800">{d.decisionText || 'N/A'}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden" style={{ breakAfter: 'auto' }}>
          <div className="p-6">
            <div className="text-[18px] font-semibold text-slate-900">Top Team Threads (Cognitive Load)</div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr className="text-[11px] text-slate-600">
                    <th className="px-3 py-2 font-semibold w-[160px]">Product</th>
                    <th className="px-3 py-2 font-semibold">Thread</th>
                    <th className="px-3 py-2 font-semibold w-[180px]">Owner</th>
                    <th className="px-3 py-2 font-semibold w-[160px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.threads.map((t, idx) => (
                    <tr key={idx} className="border-t border-slate-200 text-[12px] text-slate-800">
                      <td className="px-3 py-2">{t.product || project?.code || ''}</td>
                      <td className="px-3 py-2">{t.thread}</td>
                      <td className="px-3 py-2">{getUserName(t.ownerId)}</td>
                      <td className="px-3 py-2">{t.status}</td>
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
