
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WeeklyReport, Project, User, ReportStatus, HealthStatus, ConfidenceLevel } from '../types';
import { formatISODate, getMonthName } from '../utils';

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

  const handlePublish = () => {
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
    const element = document.getElementById('printable-report-content');
    if (!element) return;
    
    const opt = {
      margin: 0.5,
      filename: `${report.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    // @ts-ignore
    window.html2pdf().set(opt).from(element).save();
  };

  const getHealthColor = (h: string) => {
    switch(h) {
      case HealthStatus.GREEN: return 'text-green-600 bg-green-50';
      case HealthStatus.YELLOW: return 'text-yellow-600 bg-yellow-50';
      case HealthStatus.RED: return 'text-red-600 bg-red-50';
      default: return 'text-slate-500 bg-slate-100';
    }
  };

  const getUserName = (userId: string) => users.find(u => u.id === userId)?.name || 'Unknown User';

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      {/* UI ACTIONS BAR */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mb-2">{report.title}</h1>
          <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
            <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 uppercase font-bold tracking-widest">{project?.code}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <span className="opacity-50">📅</span> {getMonthName(report.month)} - Week {report.weekOfMonth}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
           <span className={`px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest ${
            report.status === ReportStatus.PUBLISHED ? 'bg-green-600 text-white shadow-lg shadow-green-500/30' : 'bg-slate-200 text-slate-600'
           }`}>
            {report.status}
          </span>
        </div>
      </div>

      <div className="flex gap-3 border-y py-4 sticky top-16 bg-slate-50/90 backdrop-blur-md z-10 overflow-x-auto no-scrollbar">
        {report.status === ReportStatus.DRAFT && (
          <button onClick={handlePublish} className="whitespace-nowrap px-4 py-2 bg-green-600 text-white font-bold rounded shadow-lg shadow-green-500/20 hover:bg-green-700 transition-all">
            Publish Report
          </button>
        )}
        {report.status === ReportStatus.DRAFT && (
          <button onClick={() => navigate(`/edit/${report.id}`)} className="whitespace-nowrap px-4 py-2 bg-blue-600 text-white font-bold rounded shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all">
            Edit Draft
          </button>
        )}
        {report.status === ReportStatus.PUBLISHED && (
          <button onClick={handleCreateRevision} className="whitespace-nowrap px-4 py-2 bg-indigo-600 text-white font-bold rounded shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all">
            Create Revision
          </button>
        )}
        <button onClick={handleExportPDF} className="whitespace-nowrap px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded hover:bg-slate-100 transition-all">
          Export PDF
        </button>
        <button onClick={() => { if(window.confirm('Delete this report?')) { onDelete(report.id); navigate('/'); }}} className="whitespace-nowrap px-4 py-2 text-red-600 font-bold hover:bg-red-50 rounded transition-all">
          Delete
        </button>
      </div>

      {/* PRINTABLE CONTENT AREA - STYLED TO MATCH THE DOCS EXACTLY */}
      <div id="printable-report-content" className="bg-white p-12 shadow-sm rounded-none print:shadow-none min-h-[11in] text-slate-800 leading-relaxed font-serif">
        <div className="max-w-3xl mx-auto space-y-12">
          
          {/* A) Header */}
          <header className="text-center space-y-4">
            <h1 className="text-3xl font-normal leading-tight">
              Weekly Snapshot – {project?.name || 'Project'} | {formatISODate(report.startDate)} – {formatISODate(report.endDate)}
            </h1>
          </header>

          {/* B) Weekly Goals & Team Health */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold border-b-2 border-slate-900 pb-1">Weekly Goals & Team Health</h2>
            <table className="w-full text-left border-collapse">
              <thead className="border-b">
                <tr className="text-sm font-bold text-slate-600">
                  <th className="py-2">Goal</th>
                  <th className="py-2">Success Metric</th>
                  <th className="py-2">Health</th>
                  <th className="py-2">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y text-sm">
                {report.goals.map((g, i) => (
                  <tr key={i}>
                    <td className="py-3 pr-4">{g.goal}</td>
                    <td className="py-3 pr-4 italic">{g.successMetric}</td>
                    <td className="py-3">{g.health}</td>
                    <td className="py-3">{g.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* C) Team Health (Capacity) */}
          <section className="space-y-2">
            <h2 className="text-lg font-bold">Team Health (Capacity)</h2>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Planned team hours: {report.capacity.plannedHours}</li>
              <li>Committed hours: {report.capacity.committedHours}</li>
              <li>Surplus/Deficit: {report.capacity.surplusDeficitHours} hrs</li>
              <li>Load status: {report.capacity.loadStatus}</li>
            </ul>
          </section>

          {/* D) Team Strength */}
          <section className="space-y-2">
            <h2 className="text-lg font-bold">Team Strength</h2>
            <ul className="list-disc pl-6 space-y-1 text-sm">
              <li>Active contributors: {report.strength.activeContributors}</li>
              <li>Critical role gaps: {report.strength.criticalRoleGaps ? 'Yes' : 'No'} {report.strength.gapNotes && `— ${report.strength.gapNotes}`}</li>
            </ul>
          </section>

          {/* E) Execution Readiness & Friction */}
          <section className="space-y-6">
            <h2 className="text-xl font-bold border-b-2 border-slate-900 pb-1">Execution Readiness & Friction</h2>
            
            <div className="space-y-2">
              <h3 className="text-lg font-bold">Sprint Health</h3>
              <ul className="list-disc pl-6 space-y-1 text-sm">
                <li>Sprint start date: {formatISODate(report.sprintHealth.startDate)}</li>
                <li>Sprint goal clarity: {report.sprintHealth.goalClarity}</li>
                <li>Sprint readiness: {report.sprintHealth.readiness}</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold">UED Health</h3>
              <ul className="list-disc pl-6 space-y-1 text-sm">
                <li>Last UED discussion: {report.uedHealth?.lastDiscussion || 'NA'}</li>
                <li>Days since last UED: {report.uedHealth?.daysSinceLast || 'NA'}</li>
                <li>Next scheduled UED: {report.uedHealth?.nextScheduled || 'NA'}</li>
                <li>Data available for metrics: {report.uedHealth?.dataAvailable ? 'Yes' : 'NA'}</li>
                <li>UED status: {report.uedHealth?.status || 'NA'}</li>
              </ul>
            </div>
          </section>

          {/* F) Bottlenecks */}
          <section className="space-y-2">
            <h2 className="text-lg font-bold">Bottlenecks (Top 3)</h2>
            <div className="text-sm">
              {report.bottlenecks && report.bottlenecks.length > 0 ? (
                <ul className="list-disc pl-6 space-y-1">
                  {report.bottlenecks.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              ) : (
                <p>No bottlenecks at the moment.</p>
              )}
            </div>
          </section>

          {/* G) Decisions Pending */}
          <section className="space-y-2">
            <h2 className="text-lg font-bold">Decisions Pending (Top 3)</h2>
            <div className="text-sm space-y-2">
              {report.decisions && report.decisions.length > 0 ? (
                report.decisions.slice(0, 3).map((d, i) => (
                  <div key={i} className="flex gap-4">
                    <span>{i + 1}</span>
                    <p>{d.decisionText} — Owner: {d.ownerRole} {d.dueDate && `/ Due: ${formatISODate(d.dueDate)}`}</p>
                  </div>
                ))
              ) : (
                <p>No pending decisions.</p>
              )}
            </div>
          </section>

          {/* H) Top Team Threads */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold">Top Team Threads (Cognitive Load)</h2>
            <table className="w-full text-left border-collapse border">
              <thead className="bg-slate-50">
                <tr className="text-xs font-bold text-slate-600 border">
                  <th className="p-2 border">Thread</th>
                  <th className="p-2 border">Owner</th>
                  <th className="p-2 border">Status</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {report.threads.map((t, i) => (
                  <tr key={i} className="border">
                    <td className="p-2 border">{t.thread}</td>
                    <td className="p-2 border">{getUserName(t.ownerId)}</td>
                    <td className="p-2 border">{t.status.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <footer className="pt-12 text-xs text-slate-400 italic">
            Report period: {formatISODate(report.startDate)} – {formatISODate(report.endDate)}
          </footer>
        </div>
      </div>
    </div>
  );
};

export default DetailView;
