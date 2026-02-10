
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import { 
  WeeklyReport, Project, User, ReportStatus, GoalRow, 
  HealthStatus, ConfidenceLevel, LoadStatus, OwnerRole, 
  DecisionItem, ThreadRow, ThreadStatus 
} from '../types';
import { getISOWeek, getWeekOfMonth } from '../utils';
import { geminiService } from '../geminiService';

interface EditorProps {
  onSave: (report: WeeklyReport) => void;
  user: User;
  projects: Project[];
  reports?: WeeklyReport[];
}

interface FormErrors {
  projectId?: string;
  startDate?: string;
  endDate?: string;
  goals?: string[];
  threads?: string[];
  capacity?: string;
}

const EditorView: React.FC<EditorProps> = ({ onSave, user, projects, reports = [] }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = !!id;
  const firstErrorRef = useRef<HTMLDivElement>(null);
  
  const queryParams = new URLSearchParams(location.search);
  const initialProjectId = queryParams.get('projectId') || projects[0]?.id || '';
  const initialStartDate = queryParams.get('startDate') || new Date().toISOString().split('T')[0];
  const initialEndDate = queryParams.get('endDate') || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const [formData, setFormData] = useState<Partial<WeeklyReport>>({
    projectId: initialProjectId,
    startDate: initialStartDate,
    endDate: initialEndDate,
    status: ReportStatus.DRAFT,
    goals: [{ goal: '', successMetric: '', health: HealthStatus.GREEN, confidence: ConfidenceLevel.HIGH }],
    decisions: [],
    threads: [{ thread: '', ownerId: user.id, status: ThreadStatus.IN_PROGRESS }],
    capacity: { plannedHours: 40, committedHours: 40, surplusDeficitHours: 0, loadStatus: LoadStatus.NORMAL },
    strength: { activeContributors: 1, criticalRoleGaps: false, gapNotes: '' },
    sprintHealth: { startDate: new Date().toISOString().split('T')[0], goalClarity: HealthStatus.GREEN, readiness: HealthStatus.GREEN },
    uedHealth: { lastDiscussion: 'NA', daysSinceLast: 'NA', nextScheduled: 'NA', dataAvailable: false, status: 'NA' },
    bottlenecks: [],
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isPublishing, setIsPublishing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  useEffect(() => {
    if (isEditing) {
      const existing = reports.find(r => r.id === id);
      if (existing) setFormData(existing);
    }
  }, [id, reports, isEditing]);

  const validate = (fullValidation = false) => {
    const newErrors: FormErrors = {};
    
    // Section A
    if (!formData.projectId) newErrors.projectId = "Project selection is required";
    if (!formData.startDate) newErrors.startDate = "Start date is required";
    if (!formData.endDate) newErrors.endDate = "End date is required";
    if (formData.startDate && formData.endDate && new Date(formData.endDate) < new Date(formData.startDate)) {
      newErrors.endDate = "End date cannot be before start date";
    }

    if (fullValidation) {
      // Goals Validation
      if (!formData.goals || formData.goals.length === 0) {
        newErrors.goals = ["At least one goal is required"];
      } else {
        const goalErrors = formData.goals.map(g => !g.goal || !g.successMetric ? "Goal and metric are required" : "");
        if (goalErrors.some(e => e !== "")) newErrors.goals = goalErrors;
      }

      // Threads Validation
      if (!formData.threads || formData.threads.length === 0) {
        newErrors.threads = ["At least one active thread is required"];
      } else {
        const threadErrors = formData.threads.map(t => !t.thread || !t.ownerId ? "Thread description and owner are required" : "");
        if (threadErrors.some(e => e !== "")) newErrors.threads = threadErrors;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAction = (status: ReportStatus) => {
    const isValid = validate(status === ReportStatus.PUBLISHED);
    
    if (!isValid) {
      if (status === ReportStatus.PUBLISHED) {
        firstErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (status === ReportStatus.DRAFT && (errors.projectId || errors.startDate || errors.endDate)) {
        // Still allow draft if rows are missing, but not if header is missing
        return;
      }
      return;
    }

    if (status === ReportStatus.PUBLISHED) {
      setShowConfirmModal(true);
    } else {
      finalizeSubmission(ReportStatus.DRAFT);
    }
  };

  const finalizeSubmission = (status: ReportStatus) => {
    setIsPublishing(true);
    const project = projects.find(p => p.id === formData.projectId)!;
    const dateObj = new Date(formData.startDate!);
    
    const finalReport: WeeklyReport = {
      ...formData as WeeklyReport,
      id: isEditing ? formData.id! : Math.random().toString(36).substr(2, 9),
      title: `Weekly Snapshot – ${project.code} | ${formData.startDate} – ${formData.endDate}`,
      isoWeek: getISOWeek(dateObj),
      year: dateObj.getFullYear(),
      month: dateObj.getMonth() + 1,
      weekOfMonth: getWeekOfMonth(dateObj),
      status: status,
      createdBy: isEditing ? formData.createdBy! : user.id,
      updatedBy: user.id,
      publishedBy: status === ReportStatus.PUBLISHED ? user.id : undefined,
      createdAt: isEditing ? formData.createdAt! : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setTimeout(() => {
      onSave(finalReport);
      setIsPublishing(false);
      navigate(`/report/${finalReport.id}`);
    }, 800);
  };

  const addGoal = () => setFormData(prev => ({ ...prev, goals: [...(prev.goals || []), { goal: '', successMetric: '', health: HealthStatus.GREEN, confidence: ConfidenceLevel.HIGH }] }));
  const removeGoal = (idx: number) => setFormData(prev => ({ ...prev, goals: (prev.goals || []).filter((_, i) => i !== idx) }));
  
  const addThread = () => setFormData(prev => ({ ...prev, threads: [...(prev.threads || []), { thread: '', ownerId: user.id, status: ThreadStatus.IN_PROGRESS }] }));
  const removeThread = (idx: number) => setFormData(prev => ({ ...prev, threads: (prev.threads || []).filter((_, i) => i !== idx) }));

  const inputClasses = (error?: string) => `w-full bg-slate-50 border ${error ? 'border-red-500 bg-red-50/30' : 'border-slate-200'} rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-sm`;
  const labelClasses = "block text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2";

  // Progress Calculation
  const checklistItems = [
    { label: "Header Details", done: !!formData.projectId && !!formData.startDate && !!formData.endDate },
    { label: "Weekly Goals", done: (formData.goals?.length || 0) > 0 && formData.goals?.every(g => !!g.goal && !!g.successMetric) },
    { label: "Team Capacity", done: !!formData.capacity?.plannedHours && !!formData.capacity?.committedHours },
    { label: "Active Threads", done: (formData.threads?.length || 0) > 0 && formData.threads?.every(t => !!t.thread) }
  ];
  const progressPercent = Math.round((checklistItems.filter(i => i.done).length / checklistItems.length) * 100);

  return (
    <div className="animate-in fade-in duration-500">
      {/* Integrated Sticky Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 -mx-8 -mt-8 mb-8 px-8 py-4 shadow-sm transition-all flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
            <span>Weekly Report</span>
            <span className="opacity-30">/</span>
            <span className="text-indigo-600">Create New</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Finish Weekly Report</h1>
            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${formData.status === ReportStatus.DRAFT ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-green-50 text-green-600 border border-green-100'}`}>
              {formData.status}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="hidden lg:flex flex-col items-end mr-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Auto-saved</span>
            <span className="text-[10px] font-bold text-slate-500">{lastSavedTime}</span>
          </div>
          <button onClick={() => navigate(-1)} className="flex-1 md:flex-none px-5 py-2.5 text-slate-500 font-bold hover:text-slate-800 rounded-xl transition-all text-xs">Cancel</button>
          <button 
            onClick={() => handleAction(ReportStatus.DRAFT)} 
            className="flex-1 md:flex-none px-5 py-2.5 bg-white border border-slate-300 text-slate-700 font-black rounded-xl hover:bg-slate-50 transition-all text-xs"
          >
            Save as Draft
          </button>
          <button 
            onClick={() => handleAction(ReportStatus.PUBLISHED)} 
            disabled={progressPercent < 100 || isPublishing}
            className={`flex-1 md:flex-none px-8 py-2.5 font-black rounded-xl shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-xs ${
              progressPercent === 100 
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/25' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            {isPublishing ? 'Publishing...' : 'Publish Report'}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-8 pb-24">
        {/* Error Summary */}
        {Object.keys(errors).length > 0 && (
          <div ref={firstErrorRef} className="col-span-12 bg-red-50 border border-red-200 p-4 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-2">
            <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-lg">⚠️</div>
            <div>
              <h3 className="text-sm font-black text-red-900 uppercase tracking-tight">Required Fields Missing</h3>
              <p className="text-xs text-red-700 font-medium">Please fix {Object.keys(errors).length} section(s) to publish this report.</p>
            </div>
          </div>
        )}

        {/* Left Column: Form sections */}
        <div className="col-span-12 lg:col-span-9 space-y-10">
          
          {/* Section A: Header & Project */}
          <section className={`bg-white rounded-[2rem] border transition-all duration-300 overflow-hidden shadow-sm ${errors.projectId || errors.startDate || errors.endDate ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}>
            <div className="px-8 py-5 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-xl shadow-sm border border-slate-100">🏢</div>
              <div>
                <h2 className="text-sm font-black text-slate-900 tracking-tight uppercase">A. Header & Project</h2>
                {errors.projectId && <span className="text-[10px] font-bold text-red-500 uppercase ml-2">Missing Info</span>}
              </div>
            </div>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2">
                <label className={labelClasses}>Project/Program Name *</label>
                <select 
                  className={inputClasses(errors.projectId)}
                  value={formData.projectId}
                  onChange={e => setFormData({ ...formData, projectId: e.target.value })}
                >
                  <option value="">Select Project...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                </select>
                {errors.projectId && <p className="mt-1.5 text-[10px] font-bold text-red-500 uppercase tracking-widest">{errors.projectId}</p>}
              </div>
              <div>
                <label className={labelClasses}>Start Date *</label>
                <DatePicker
                  selected={formData.startDate ? new Date(formData.startDate) : null}
                  onChange={(date) => setFormData({...formData, startDate: date?.toISOString().split('T')[0]})}
                  className={inputClasses(errors.startDate)}
                  dateFormat="yyyy-MM-dd"
                />
              </div>
              <div>
                <label className={labelClasses}>End Date *</label>
                <DatePicker
                  selected={formData.endDate ? new Date(formData.endDate) : null}
                  onChange={(date) => setFormData({...formData, endDate: date?.toISOString().split('T')[0]})}
                  className={inputClasses(errors.endDate)}
                  dateFormat="yyyy-MM-dd"
                  placeholderText="Select end date"
                  minDate={formData.startDate ? new Date(formData.startDate) : undefined}
                />
                {errors.endDate && <p className="mt-1.5 text-[10px] font-bold text-red-500 uppercase tracking-widest">{errors.endDate}</p>}
              </div>
            </div>
          </section>

          {/* Section B: Weekly Goals */}
          <section className={`bg-white rounded-[2rem] border transition-all duration-300 overflow-hidden shadow-sm ${errors.goals ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}>
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-xl shadow-sm border border-slate-100">🎯</div>
                <h2 className="text-sm font-black text-slate-900 tracking-tight uppercase">B. Section 1: Weekly Goals & Team Health</h2>
              </div>
              <button onClick={addGoal} className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-indigo-600 transition-all">+ Add Goal</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/30 border-b border-slate-100">
                  <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 font-black">
                    <th className="px-8 py-4">Goal *</th>
                    <th className="px-4 py-4">Success Metric *</th>
                    <th className="px-4 py-4">Health</th>
                    <th className="px-4 py-4">Confidence</th>
                    <th className="px-8 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(formData.goals || []).map((goal, idx) => (
                    <tr key={idx} className="group">
                      <td className="px-8 py-5">
                        <input className={inputClasses(errors.goals?.[idx] ? 'error' : '')} placeholder="What is the priority?" value={goal.goal} onChange={e => {
                          const g = [...(formData.goals || [])]; g[idx].goal = e.target.value; setFormData({...formData, goals: g});
                        }} />
                      </td>
                      <td className="px-4 py-5">
                        <div className="relative">
                          <input className={inputClasses(errors.goals?.[idx] ? 'error' : '')} placeholder="Outcome..." value={goal.successMetric} onChange={e => {
                            const g = [...(formData.goals || [])]; g[idx].successMetric = e.target.value; setFormData({...formData, goals: g});
                          }} />
                        </div>
                      </td>
                      <td className="px-4 py-5">
                        <select className={inputClasses()} value={goal.health} onChange={e => {
                          const g = [...(formData.goals || [])]; g[idx].health = e.target.value as HealthStatus; setFormData({...formData, goals: g});
                        }}>
                          <option value={HealthStatus.GREEN}>Green</option><option value={HealthStatus.YELLOW}>Yellow</option><option value={HealthStatus.RED}>Red</option>
                        </select>
                      </td>
                      <td className="px-4 py-5">
                        <select className={inputClasses()} value={goal.confidence} onChange={e => {
                          const g = [...(formData.goals || [])]; g[idx].confidence = e.target.value as ConfidenceLevel; setFormData({...formData, goals: g});
                        }}>
                          <option value={ConfidenceLevel.HIGH}>High</option><option value={ConfidenceLevel.MED}>Med</option><option value={ConfidenceLevel.LOW}>Low</option>
                        </select>
                      </td>
                      <td className="px-8 py-5">
                        <button onClick={() => removeGoal(idx)} className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section C: Team Health & Key Decisions */}
          <section className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-8 py-5 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-xl shadow-sm border border-slate-100">⚕️</div>
              <h2 className="text-sm font-black text-slate-900 tracking-tight uppercase">C. Section 2: Team Health & Key Decisions</h2>
            </div>
            <div className="p-8 space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-2 border-indigo-500 pl-3">Capacity & Loading</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelClasses}>Planned Hours</label><input type="number" className={inputClasses()} value={formData.capacity?.plannedHours} onChange={e => setFormData({...formData, capacity: {...formData.capacity!, plannedHours: Number(e.target.value)}})} /></div>
                    <div><label className={labelClasses}>Committed Hours</label><input type="number" className={inputClasses()} value={formData.capacity?.committedHours} onChange={e => setFormData({...formData, capacity: {...formData.capacity!, committedHours: Number(e.target.value)}})} /></div>
                    <div className="col-span-2">
                      <label className={labelClasses}>Load Classification</label>
                      <select className={inputClasses()} value={formData.capacity?.loadStatus} onChange={e => setFormData({...formData, capacity: {...formData.capacity!, loadStatus: e.target.value as LoadStatus}})}>
                        {Object.values(LoadStatus).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-2 border-emerald-500 pl-3">Team Strength</h3>
                   <div className="space-y-4">
                    <div><label className={labelClasses}>Active Contributors</label><input type="number" className={inputClasses()} value={formData.strength?.activeContributors} onChange={e => setFormData({...formData, strength: {...formData.strength!, activeContributors: Number(e.target.value)}})} /></div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Critical Role Gaps?</span>
                      <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={formData.strength?.criticalRoleGaps} onChange={e => setFormData({...formData, strength: {...formData.strength!, criticalRoleGaps: e.target.checked}})} />
                    </div>
                   </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section D: Threads */}
          <section className={`bg-white rounded-[2rem] border transition-all duration-300 overflow-hidden shadow-sm ${errors.threads ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200'}`}>
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-xl shadow-sm border border-slate-100">🧶</div>
                <h2 className="text-sm font-black text-slate-900 tracking-tight uppercase">D. Section 3: Top Team Threads (Cognitive Load)</h2>
              </div>
              <button onClick={addThread} className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-indigo-600 transition-all">+ Add Thread</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/30 border-b border-slate-100">
                  <tr className="text-left text-[10px] uppercase tracking-widest text-slate-400 font-black">
                    <th className="px-8 py-4">Thread *</th>
                    <th className="px-4 py-4">Owner *</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-8 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(formData.threads || []).map((t, idx) => (
                    <tr key={idx} className="group">
                      <td className="px-8 py-5">
                        <input className={inputClasses(errors.threads?.[idx] ? 'error' : '')} placeholder="What's being tracked?" value={t.thread} onChange={e => {
                          const ths = [...(formData.threads || [])]; ths[idx].thread = e.target.value; setFormData({...formData, threads: ths});
                        }} />
                      </td>
                      <td className="px-4 py-5">
                        <input className={inputClasses(errors.threads?.[idx] ? 'error' : '')} placeholder="Owner ID" value={t.ownerId} onChange={e => {
                          const ths = [...(formData.threads || [])]; ths[idx].ownerId = e.target.value; setFormData({...formData, threads: ths});
                        }} />
                      </td>
                      <td className="px-4 py-5">
                        <select className={inputClasses()} value={t.status} onChange={e => {
                          const ths = [...(formData.threads || [])]; ths[idx].status = e.target.value as ThreadStatus; setFormData({...formData, threads: ths});
                        }}>
                          {Object.values(ThreadStatus).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                        </select>
                      </td>
                      <td className="px-8 py-5">
                        <button onClick={() => removeThread(idx)} className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right Column: Utility panel */}
        <div className="col-span-12 lg:col-span-3 space-y-6">
          <div className="sticky top-24 space-y-6">
            
            {/* Submission Progress */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Submission Progress</h3>
              <div className="flex justify-between items-end mb-2">
                <span className="text-xl font-black text-slate-900">{progressPercent}%</span>
                <span className="text-[10px] font-bold text-indigo-600 uppercase">Ready to Publish</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-6">
                <div className="bg-indigo-600 h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }}></div>
              </div>
              
              <ul className="space-y-4">
                {checklistItems.map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${item.done ? 'bg-indigo-600 border-indigo-600' : 'border-slate-200'}`}>
                      {item.done && <span className="text-white text-[10px]">✓</span>}
                    </div>
                    <span className={`text-xs font-bold transition-all ${item.done ? 'text-slate-900' : 'text-slate-400'}`}>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Preparation Card */}
            <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-[2rem]">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">💡</span>
                <h3 className="text-xs font-black text-indigo-900 uppercase">Quick Tips</h3>
              </div>
              <p className="text-xs text-indigo-800/70 leading-relaxed font-medium">
                Save your progress often as a draft. Final publish locks the record for audit compliance. 
                Revisions can be created later if needed.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl space-y-6 border border-slate-100">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-inner">📄</div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">Publish Snapshot?</h3>
              <p className="text-sm text-slate-500 font-medium">You won't be able to edit this report after publishing. A historical audit log will be generated.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all">Go Back</button>
              <button 
                onClick={() => {
                  setShowConfirmModal(false);
                  finalizeSubmission(ReportStatus.PUBLISHED);
                }} 
                className="flex-1 px-6 py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 shadow-xl shadow-indigo-600/25 transition-all"
              >
                Yes, Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditorView;
