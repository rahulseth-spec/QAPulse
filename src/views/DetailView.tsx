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

      <div id="printable-report-content" className="bg-white p-12 shadow-sm rounded-none print:shadow-none min-h-[11in] text-slate-800 leading-relaxed font-serif">
        <div className="max-w-3xl mx-auto space-y-12">
          <section>
            <h2 className="text-xl font-bold mb-4">Weekly Goals</h2>
            <ul className="space-y-2">
              {report.goals.map((g, i) => (
                <li key={i} className={`text-sm px-3 py-2 rounded ${getHealthColor(g.health)}`}>
                  <span className="font-semibold">{g.goal}</span>
                  <span className="opacity-60"> — {g.successMetric}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-4">Capacity & Strength</h2>
            <div className="text-sm grid grid-cols-2 gap-2">
              <div>Planned: {report.capacity.plannedHours}h</div>
              <div>Committed: {report.capacity.committedHours}h</div>
              <div>Surplus/Deficit: {report.capacity.surplusDeficitHours}h</div>
              <div>Load Status: {report.capacity.loadStatus}</div>
              <div>Active Contributors: {report.strength.activeContributors}</div>
              <div>Critical Role Gaps: {report.strength.criticalRoleGaps ? 'Yes' : 'No'}</div>
            </div>
          </section>
          <section>
            <h2 className="text-xl font-bold mb-4">Threads</h2>
            <ul className="list-disc ml-6">
              {report.threads.map((t, i) => (
                <li key={i} className="text-sm">
                  {t.thread} — {getUserName(t.ownerId)} ({t.status})
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
};

export default DetailView;
