import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import { 
  WeeklyReport, Project, User, ReportStatus, GoalRow,
  HealthStatus, ConfidenceLevel, LoadStatus, OwnerRole,
  ThreadStatus
} from '../types';
import { formatLocalISODate, getISOWeek, getMonthName, getWeekOfMonth, parseISODateToLocal } from '../utils';
import { ThemedSelect, type ThemedSelectOption } from '../components/ThemedSelect';

interface EditorProps {
  onSave: (report: WeeklyReport) => void;
  user: User;
  projects: Project[];
  users: User[];
  reports?: WeeklyReport[];
}

const GOAL_ROWS = 1;
const BOTTLENECK_ROWS = 3;
const DECISION_ROWS = 3;
const THREAD_ROWS = 1;

const EditorView: React.FC<EditorProps> = ({ onSave, user, projects, users, reports = [] }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = !!id;
  const firstErrorRef = useRef<HTMLDivElement>(null);
  
  const todayISO = formatLocalISODate(new Date());
  const addDaysISO = (isoDate: string, days: number) => {
    const d = parseISODateToLocal(isoDate);
    d.setDate(d.getDate() + days);
    return formatLocalISODate(d);
  };

  const padArray = <T,>(arr: T[] | undefined, targetLength: number, factory: (index: number) => T) => {
    const base = Array.isArray(arr) ? [...arr] : [];
    while (base.length < targetLength) base.push(factory(base.length));
    return base;
  };

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

  const getWeekEndFridayISO = (isoDate: string) => addDaysISO(getWeekStartMondayISO(isoDate), 4);

  const formatTitle = (projectName: string | undefined, startISO: string) => {
    const d = parseISODateToLocal(startISO);
    const month = getMonthName(d.getMonth() + 1);
    const yy = d.getFullYear().toString().slice(-2);
    const weekOfMonth = getWeekOfMonth(d);
    return `Weekly Snapshot – ${projectName || 'Project'} | Week ${weekOfMonth} - ${month}’${yy}`;
  };

  const buildNewReportFormData = (search: string): Partial<WeeklyReport> => {
    const queryParams = new URLSearchParams(search);
    const initialProjectId = queryParams.get('projectId') || projects[0]?.id || '';
    const initialStartDate = queryParams.get('startDate') || todayISO;
    const initialEndDate = queryParams.get('endDate') || addDaysISO(initialStartDate, 4);

    return {
      projectId: initialProjectId,
      startDate: initialStartDate,
      endDate: initialEndDate,
      status: ReportStatus.DRAFT,
      goals: padArray([], GOAL_ROWS, () => ({ goal: '', successMetric: '', health: HealthStatus.GREEN, confidence: ConfidenceLevel.MED })),
      decisions: padArray([], DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' })),
      threads: padArray([], THREAD_ROWS, () => ({ product: '', thread: '', ownerId: user.id, status: ThreadStatus.IN_PROGRESS })),
      capacity: { plannedHours: 40, committedHours: 40, surplusDeficitHours: 0, loadStatus: LoadStatus.NORMAL },
      strength: { activeContributors: 0, activeContributorNames: '', criticalRoleGaps: false, gapNotes: '' },
      sprintHealth: { startDate: initialStartDate, goalClarity: HealthStatus.GREEN, readiness: HealthStatus.GREEN },
      uedHealth: { lastDiscussion: '', daysSinceLast: '', nextScheduled: '', dataAvailable: false, status: 'NA' },
      bottlenecks: padArray([], BOTTLENECK_ROWS, () => ''),
    };
  };

  const [formData, setFormData] = useState<Partial<WeeklyReport>>(() => buildNewReportFormData(location.search));

  const [lastSavedTime, setLastSavedTime] = useState<string>(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  const normalizeExistingForEditor = (existing: WeeklyReport): Partial<WeeklyReport> => {
    const goals = padArray(existing.goals, GOAL_ROWS, () => ({ goal: '', successMetric: '', health: HealthStatus.GREEN, confidence: ConfidenceLevel.MED }));
    const bottlenecks = padArray(existing.bottlenecks, BOTTLENECK_ROWS, () => '');
    const decisions = padArray(existing.decisions, DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' }));
    const threads = padArray(existing.threads, THREAD_ROWS, () => ({ product: '', thread: '', ownerId: user.id, status: ThreadStatus.IN_PROGRESS }));
    const plannedHours = existing.capacity?.plannedHours ?? 0;
    const committedHours = existing.capacity?.committedHours ?? 0;
    const surplusDeficitHours = plannedHours - committedHours;

    return {
      ...existing,
      goals,
      bottlenecks,
      decisions,
      threads,
      capacity: {
        plannedHours,
        committedHours,
        surplusDeficitHours,
        loadStatus: existing.capacity?.loadStatus ?? LoadStatus.NORMAL,
      },
      strength: {
        activeContributors: existing.strength?.activeContributors ?? 0,
        activeContributorNames: existing.strength?.activeContributorNames ?? '',
        criticalRoleGaps: existing.strength?.criticalRoleGaps ?? false,
        gapNotes: existing.strength?.gapNotes ?? '',
      },
      sprintHealth: {
        startDate: existing.sprintHealth?.startDate ?? existing.startDate,
        goalClarity: existing.sprintHealth?.goalClarity ?? HealthStatus.GREEN,
        readiness: existing.sprintHealth?.readiness ?? HealthStatus.GREEN,
      },
      uedHealth: {
        lastDiscussion: existing.uedHealth?.lastDiscussion ?? '',
        daysSinceLast: existing.uedHealth?.daysSinceLast ?? '',
        nextScheduled: existing.uedHealth?.nextScheduled ?? '',
        dataAvailable: existing.uedHealth?.dataAvailable ?? false,
        status: existing.uedHealth?.status ?? 'NA',
      },
    };
  };

  useEffect(() => {
    if (isEditing) {
      const existing = reports.find(r => r.id === id);
      if (existing) setFormData(normalizeExistingForEditor(existing));
    }
  }, [id, reports, isEditing]);

  useEffect(() => {
    if (isEditing) return;
    setFormData(buildNewReportFormData(location.search));
    setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }, [isEditing, location.search]);

  const computeActiveContributorCount = (names: string) => {
    const parts = names
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    return parts.length;
  };

  const headerIsValid = (() => {
    if (!formData.projectId || !formData.startDate || !formData.endDate) return false;
    if (!isWeekdayISO(formData.startDate) || !isWeekdayISO(formData.endDate)) return false;
    if (parseISODateToLocal(formData.endDate) < parseISODateToLocal(formData.startDate)) return false;
    const maxEnd = getWeekEndFridayISO(formData.startDate);
    if (parseISODateToLocal(formData.endDate) > parseISODateToLocal(maxEnd)) return false;
    return true;
  })();

  const publishIsValid = (() => {
    if (!headerIsValid) return false;
    const goals = formData.goals || [];
    if (goals.length < GOAL_ROWS) return false;
    if (goals.slice(0, GOAL_ROWS).some(g => !g.goal.trim() || !g.successMetric.trim())) return false;
    if (
      goals.slice(GOAL_ROWS).some(g => {
        const any = g.goal.trim() || g.successMetric.trim();
        return any && (!g.goal.trim() || !g.successMetric.trim());
      })
    ) {
      return false;
    }

    const capacity = formData.capacity;
    if (!capacity) return false;
    if (!Number.isFinite(capacity.plannedHours) || capacity.plannedHours <= 0) return false;
    if (!Number.isFinite(capacity.committedHours) || capacity.committedHours <= 0) return false;
    if (!capacity.loadStatus) return false;

    const strength = formData.strength;
    if (!strength) return false;
    if (!strength.activeContributorNames?.trim()) return false;
    if (computeActiveContributorCount(strength.activeContributorNames) <= 0) return false;

    const sprintHealth = formData.sprintHealth;
    if (!sprintHealth) return false;
    if (!sprintHealth.startDate) return false;
    if (sprintHealth.goalClarity === 'NA' || !sprintHealth.goalClarity) return false;
    if (sprintHealth.readiness === 'NA' || !sprintHealth.readiness) return false;

    const uedHealth = formData.uedHealth;
    if (!uedHealth) return false;
    if (!uedHealth.lastDiscussion.trim()) return false;
    if (!uedHealth.daysSinceLast.trim()) return false;
    if (!uedHealth.nextScheduled.trim()) return false;
    if (uedHealth.status === 'NA' || !uedHealth.status) return false;

    const bottlenecks = formData.bottlenecks || [];
    if (bottlenecks.length < BOTTLENECK_ROWS) return false;
    if (bottlenecks.slice(0, BOTTLENECK_ROWS).some(b => !b.trim())) return false;

    const decisions = formData.decisions || [];
    if (decisions.length < DECISION_ROWS) return false;
    if (decisions.slice(0, DECISION_ROWS).some(d => !d.decisionText.trim())) return false;

    const threads = formData.threads || [];
    if (threads.length < THREAD_ROWS) return false;
    if (threads.slice(0, THREAD_ROWS).some(t => !t.product?.trim() || !t.thread.trim() || !t.ownerId || !t.status)) return false;
    if (
      threads.slice(THREAD_ROWS).some(t => {
        const any = (t.product || '').trim() || t.thread.trim() || t.ownerId || t.status;
        return any && (!t.product?.trim() || !t.thread.trim() || !t.ownerId || !t.status);
      })
    ) {
      return false;
    }

    return true;
  })();

  const draftIsValid = (() => {
    const goals = formData.goals || [];
    const threads = formData.threads || [];
    const bottlenecks = formData.bottlenecks || [];
    const decisions = formData.decisions || [];
    const strengthNames = formData.strength?.activeContributorNames || '';
    const hasAny =
      goals.some(g => g.goal.trim() || g.successMetric.trim()) ||
      threads.some(t => (t.product || '').trim() || t.thread.trim()) ||
      bottlenecks.some(b => b.trim()) ||
      decisions.some(d => d.decisionText.trim()) ||
      strengthNames.trim().length > 0;
    return hasAny;
  })();

  const handleAction = (status: ReportStatus) => {
    if (status === ReportStatus.PUBLISHED) {
      if (!publishIsValid) {
        firstErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    } else {
      if (!draftIsValid) {
        firstErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (!headerIsValid) {
        firstErrorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    finalizeSubmission(status === ReportStatus.PUBLISHED ? ReportStatus.PUBLISHED : ReportStatus.DRAFT);
  };

  const finalizeSubmission = (status: ReportStatus) => {
    const startDateObj = parseISODateToLocal(formData.startDate!);
    const isoWeek = getISOWeek(startDateObj);
    const month = startDateObj.getMonth() + 1;
    const weekOfMonth = getWeekOfMonth(startDateObj);
    const projectName = projects.find(p => p.id === formData.projectId)?.name;
    const computedActive = computeActiveContributorCount(formData.strength?.activeContributorNames || '');

    const newReport: WeeklyReport = {
      id: isEditing ? id! : `r-${Date.now()}`,
      projectId: formData.projectId!,
      title: formatTitle(projectName, formData.startDate!),
      startDate: formData.startDate!,
      endDate: formData.endDate!,
      isoWeek,
      year: startDateObj.getFullYear(),
      month,
      weekOfMonth,
      status,
      goals: formData.goals || [],
      capacity: formData.capacity!,
      strength: {
        ...formData.strength!,
        activeContributors: computedActive,
      },
      decisions: formData.decisions || [],
      sprintHealth: formData.sprintHealth!,
      uedHealth: formData.uedHealth!,
      bottlenecks: formData.bottlenecks || [],
      threads: formData.threads || [],
      createdBy: user.id,
      updatedBy: user.id,
      publishedBy: status === ReportStatus.PUBLISHED ? user.id : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(newReport);
    setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    if (status === ReportStatus.PUBLISHED) {
      navigate(`/report/${newReport.id}`);
    }
  };

  const projectOptions: ThemedSelectOption[] = projects.map(p => ({ value: p.id, label: p.name }));
  const ownerOptions: ThemedSelectOption[] = users.map(u => ({ value: u.id, label: u.name }));

  const yesNoOptions: ThemedSelectOption[] = [
    { value: 'NO', label: 'No' },
    { value: 'YES', label: 'Yes' },
  ];

  const healthOptions: ThemedSelectOption[] = [
    { value: HealthStatus.GREEN, label: 'Green' },
    { value: HealthStatus.YELLOW, label: 'Yellow' },
    { value: HealthStatus.RED, label: 'Red' },
  ];

  const healthWithNAOptions: ThemedSelectOption[] = [
    { value: 'NA', label: 'NA' },
    ...healthOptions,
  ];

  const confidenceOptions: ThemedSelectOption[] = [
    { value: ConfidenceLevel.HIGH, label: 'High' },
    { value: ConfidenceLevel.MED, label: 'Med' },
    { value: ConfidenceLevel.LOW, label: 'Low' },
  ];

  const loadStatusOptions: ThemedSelectOption[] = [
    { value: LoadStatus.NORMAL, label: 'Normal' },
    { value: LoadStatus.OVERLOADED, label: 'Overloaded' },
    { value: LoadStatus.UNDERUTILIZED, label: 'Underutilized' },
  ];

  const ownerRoleOptions: ThemedSelectOption[] = [
    { value: OwnerRole.QA, label: 'QA' },
    { value: OwnerRole.DEV, label: 'Dev' },
    { value: OwnerRole.PM, label: 'PM' },
    { value: OwnerRole.OTHER, label: 'Other' },
  ];

  const threadStatusOptions: ThemedSelectOption[] = [
    { value: ThreadStatus.NOT_STARTED, label: 'Not started' },
    { value: ThreadStatus.IN_PROGRESS, label: 'In progress' },
    { value: ThreadStatus.COMPLETED, label: 'Completed' },
    { value: ThreadStatus.BLOCKED, label: 'Blocked' },
  ];

  const inputClasses =
    "w-full h-12 bg-white border border-slate-200 rounded-xl px-4 text-[14px] text-slate-900 outline-none focus:ring-4 focus:ring-[#407B7E]/20 focus:border-[#407B7E] transition-colors placeholder:text-slate-400";
  const cellInputClasses =
    "w-full h-12 bg-white border border-slate-200 rounded-xl px-4 text-[14px] text-slate-900 outline-none focus:ring-4 focus:ring-[#407B7E]/20 focus:border-[#407B7E] transition-colors placeholder:text-slate-400";
  const cellSelectButtonClasses = "h-12 rounded-xl px-4 pr-10 text-[14px]";
  const headerSelectButtonClasses = "h-12";

  const sectionTitleClasses = "text-[12px] font-bold text-slate-900 tracking-tight";
  const pageTitleClasses = "text-[14px] font-bold text-slate-900 tracking-tight";
  const pageTitleOnColorClasses = "text-[14px] font-bold text-white tracking-tight";
  const fieldRowClasses = "grid grid-cols-1 sm:grid-cols-[170px_1fr] items-center gap-2 sm:gap-3";
  const fieldLabelClasses = "text-[12px] text-slate-500";
  const actionButtonClasses =
    "h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors";
  const headerActionButtonClasses =
    "h-10 px-4 rounded-xl bg-white/10 border border-white/20 text-white font-semibold text-[13px] hover:bg-white/15 transition-colors";
  const removeButtonClasses =
    "h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-600 font-semibold text-[13px] hover:bg-slate-50 hover:text-slate-900 transition-colors";

  const getHealthDotClassName = (val: string) => {
    if (val === 'GREEN') return 'bg-emerald-500';
    if (val === 'YELLOW') return 'bg-amber-500';
    if (val === 'RED') return 'bg-rose-500';
    if (val === 'NA') return 'bg-slate-300';
    return undefined;
  };

  const getConfidenceDotClassName = (val: string) => {
    if (val === 'HIGH') return 'bg-emerald-500';
    if (val === 'MED') return 'bg-amber-500';
    if (val === 'LOW') return 'bg-rose-500';
    return undefined;
  };

  const getLoadStatusDotClassName = (val: string) => {
    if (val === 'NORMAL') return 'bg-emerald-500';
    if (val === 'UNDERUTILIZED') return 'bg-amber-500';
    if (val === 'OVERLOADED') return 'bg-rose-500';
    return undefined;
  };

  const getThreadStatusDotClassName = (val: string) => {
    if (val === 'COMPLETED') return 'bg-emerald-500';
    if (val === 'IN_PROGRESS') return 'bg-amber-500';
    if (val === 'BLOCKED') return 'bg-rose-500';
    if (val === 'NOT_STARTED') return 'bg-slate-300';
    return undefined;
  };

  const updateCapacity = (partial: Partial<WeeklyReport['capacity']>) => {
    setFormData(prev => {
      const plannedHours = partial.plannedHours ?? prev.capacity?.plannedHours ?? 0;
      const committedHours = partial.committedHours ?? prev.capacity?.committedHours ?? 0;
      return {
        ...prev,
        capacity: {
          plannedHours,
          committedHours,
          surplusDeficitHours: plannedHours - committedHours,
          loadStatus: partial.loadStatus ?? prev.capacity?.loadStatus ?? LoadStatus.NORMAL,
        },
      };
    });
  };

  const reportProject = projects.find(p => p.id === formData.projectId);
  const reportTitle = formData.startDate ? formatTitle(reportProject?.name, formData.startDate) : 'Weekly Snapshot';

  const addGoalRow = () => {
    setFormData(prev => ({
      ...prev,
      goals: [
        ...(prev.goals || []),
        { goal: '', successMetric: '', health: HealthStatus.GREEN, confidence: ConfidenceLevel.MED },
      ],
    }));
  };

  const removeGoalRow = (idx: number) => {
    setFormData(prev => {
      const current = [...(prev.goals || [])];
      if (current.length <= GOAL_ROWS) return prev;
      current.splice(idx, 1);
      return {
        ...prev,
        goals: padArray(current, GOAL_ROWS, () => ({ goal: '', successMetric: '', health: HealthStatus.GREEN, confidence: ConfidenceLevel.MED })),
      };
    });
  };

  const addBottleneckRow = () => setFormData(prev => ({ ...prev, bottlenecks: [...(prev.bottlenecks || []), ''] }));
  const removeBottleneckRow = (idx: number) =>
    setFormData(prev => {
      const current = [...(prev.bottlenecks || [])];
      if (current.length <= BOTTLENECK_ROWS) return prev;
      current.splice(idx, 1);
      return { ...prev, bottlenecks: padArray(current, BOTTLENECK_ROWS, () => '') };
    });

  const addDecisionRow = () =>
    setFormData(prev => ({
      ...prev,
      decisions: [...(prev.decisions || []), { decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' }],
    }));
  const removeDecisionRow = (idx: number) =>
    setFormData(prev => {
      const current = [...(prev.decisions || [])];
      if (current.length <= DECISION_ROWS) return prev;
      current.splice(idx, 1);
      return { ...prev, decisions: padArray(current, DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' })) };
    });

  const addThreadRow = () =>
    setFormData(prev => ({
      ...prev,
      threads: [...(prev.threads || []), { product: '', thread: '', ownerId: user.id, status: ThreadStatus.IN_PROGRESS }],
    }));
  const removeThreadRow = (idx: number) =>
    setFormData(prev => {
      const current = [...(prev.threads || [])];
      if (current.length <= THREAD_ROWS) return prev;
      current.splice(idx, 1);
      return { ...prev, threads: padArray(current, THREAD_ROWS, () => ({ product: '', thread: '', ownerId: user.id, status: ThreadStatus.IN_PROGRESS })) };
    });

  return (
    <div className="space-y-10">
      <div className="bg-gradient-to-br from-[#073D44] to-[#407B7E] rounded-[20px] p-8 md:p-10 text-white border border-white/10 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[28px] leading-[36px] font-bold tracking-tight">{isEditing ? 'Edit Weekly Report' : 'Create Weekly Report'}</h1>
            <p className="mt-2 text-[15px] leading-[24px] text-white/80">Landscape report template with required publish validation.</p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              className={`h-12 px-5 rounded-xl text-white font-semibold text-[14px] border transition-colors ${
                draftIsValid && headerIsValid ? 'bg-white/10 border-white/15 hover:bg-white/15' : 'bg-white/5 border-white/10 opacity-60 cursor-not-allowed'
              }`}
              onClick={() => handleAction(ReportStatus.DRAFT)}
              disabled={!draftIsValid || !headerIsValid}
            >
              Save Draft
            </button>
            <button
              className={`h-12 px-5 rounded-xl font-semibold text-[14px] transition-colors ${
                publishIsValid ? 'bg-white text-[#073D44] hover:bg-white/90' : 'bg-white/70 text-[#073D44]/70 opacity-70 cursor-not-allowed'
              }`}
              onClick={() => handleAction(ReportStatus.PUBLISHED)}
              disabled={!publishIsValid}
            >
              Publish
            </button>
          </div>
        </div>
        <div ref={firstErrorRef} />
      </div>

      <section className="bg-white p-6 md:p-8 rounded-[20px] border border-slate-200 shadow-sm space-y-6">
        <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.16em]">Report Header</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="block text-[12px] font-semibold text-slate-600">Project</label>
            <ThemedSelect
              value={formData.projectId ?? ''}
              onChange={(projectId) => setFormData(prev => ({ ...prev, projectId }))}
              options={projectOptions}
              placeholder={projectOptions.length > 0 ? 'Select project/program' : 'No projects available'}
              disabled={projectOptions.length === 0}
              buttonClassName={headerSelectButtonClasses}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[12px] font-semibold text-slate-600">Start Date (Mon–Fri)</label>
            <DatePicker
              icon={null}
              selected={formData.startDate ? parseISODateToLocal(formData.startDate) : null}
              onChange={(date: Date | null) =>
                setFormData(prev => {
                  if (!date) return prev;
                  const nextStartObj = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                  const nextStart = formatLocalISODate(nextStartObj);
                  const maxEndISO = getWeekEndFridayISO(nextStart);
                  const maxEndObj = parseISODateToLocal(maxEndISO);
                  const prevEndObj = prev.endDate ? parseISODateToLocal(prev.endDate) : null;
                  const nextEndObj =
                    prevEndObj && prevEndObj >= nextStartObj && prevEndObj <= maxEndObj && isWeekdayISO(formatLocalISODate(prevEndObj))
                      ? prevEndObj
                      : maxEndObj;
                  const nextEnd = formatLocalISODate(nextEndObj);

                  return {
                    ...prev,
                    startDate: nextStart,
                    endDate: nextEnd,
                    sprintHealth: {
                      ...(prev.sprintHealth || { startDate: nextStart, goalClarity: HealthStatus.GREEN, readiness: HealthStatus.GREEN }),
                      startDate: nextStart,
                    },
                  };
                })
              }
              placeholderText="e.g., 2026-02-10"
              className={inputClasses}
              dateFormat="yyyy-MM-dd"
              filterDate={(d: Date) => {
                const day = d.getDay();
                return day !== 0 && day !== 6;
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-[12px] font-semibold text-slate-600">End Date (Max Fri)</label>
            <DatePicker
              icon={null}
              selected={formData.endDate ? parseISODateToLocal(formData.endDate) : null}
              onChange={(date: Date | null) =>
                setFormData(prev => {
                  if (!date) return prev;
                  const nextEndObj = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                  return { ...prev, endDate: formatLocalISODate(nextEndObj) };
                })
              }
              placeholderText="e.g., 2026-02-14"
              className={inputClasses}
              dateFormat="yyyy-MM-dd"
              minDate={formData.startDate ? parseISODateToLocal(formData.startDate) : undefined}
              maxDate={formData.startDate ? parseISODateToLocal(getWeekEndFridayISO(formData.startDate)) : undefined}
              filterDate={(d: Date) => {
                const day = d.getDay();
                return day !== 0 && day !== 6;
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-[12px] font-semibold text-slate-700">{reportTitle}</div>
          <div className="text-[12px] text-slate-500">Last saved: {lastSavedTime}</div>
        </div>
      </section>

      <div className="space-y-8">
        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
          <div className="px-6 py-5 bg-gradient-to-r from-[#073D44] to-[#407B7E]">
            <div className="text-[14px] font-semibold text-white">{reportTitle}</div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className={pageTitleOnColorClasses}>Goals &amp; Team Health</div>
              <button
                type="button"
                onClick={addGoalRow}
                className={headerActionButtonClasses}
              >
                Add row
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr className="text-[11px] text-slate-600">
                    <th className="px-3 py-3 font-semibold">Goal</th>
                    <th className="px-3 py-3 font-semibold">Success Metric</th>
                    <th className="px-3 py-3 font-semibold w-[140px]">Health</th>
                    <th className="px-3 py-3 font-semibold w-[140px]">Confidence</th>
                    <th className="px-3 py-3 font-semibold w-[96px] text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {(formData.goals || []).map((g, idx) => (
                    <tr key={idx} className="border-t border-slate-200">
                      <td className="px-3 py-3">
                        <input
                          value={g.goal}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData(prev => {
                              const next = [...(prev.goals || [])];
                              next[idx] = { ...next[idx], goal: value } as GoalRow;
                              return { ...prev, goals: next };
                            });
                          }}
                          className={cellInputClasses}
                          placeholder="e.g., Improve test stability"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={g.successMetric}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData(prev => {
                              const next = [...(prev.goals || [])];
                              next[idx] = { ...next[idx], successMetric: value } as GoalRow;
                              return { ...prev, goals: next };
                            });
                          }}
                          className={cellInputClasses}
                          placeholder="e.g., Reduce flaky failures to <2%"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <ThemedSelect
                          value={g.health}
                          onChange={(value) => {
                            setFormData(prev => {
                              const next = [...(prev.goals || [])];
                              next[idx] = { ...next[idx], health: value as HealthStatus } as GoalRow;
                              return { ...prev, goals: next };
                            });
                          }}
                          options={healthOptions}
                          buttonClassName={cellSelectButtonClasses}
                          getOptionDotClassName={getHealthDotClassName}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <ThemedSelect
                          value={g.confidence}
                          onChange={(value) => {
                            setFormData(prev => {
                              const next = [...(prev.goals || [])];
                              next[idx] = { ...next[idx], confidence: value as ConfidenceLevel } as GoalRow;
                              return { ...prev, goals: next };
                            });
                          }}
                          options={confidenceOptions}
                          buttonClassName={cellSelectButtonClasses}
                          getOptionDotClassName={getConfidenceDotClassName}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {idx >= GOAL_ROWS && (formData.goals || []).length > GOAL_ROWS && (
                          <button
                            type="button"
                            onClick={() => removeGoalRow(idx)}
                            className={removeButtonClasses}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-[#073D44] to-[#407B7E] flex items-center justify-between">
            <div className={pageTitleOnColorClasses}>Execution Readiness &amp; Friction</div>
          </div>
          <div className="p-6">
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-8">
                <div className="space-y-3">
                  <div className={sectionTitleClasses}>Sprint Health</div>
                  <div className="space-y-3">
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Sprint start date</span>
                      <input
                        type="date"
                        value={formData.sprintHealth?.startDate || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, sprintHealth: { ...(prev.sprintHealth as any), startDate: e.target.value } }))}
                        className={cellInputClasses}
                      />
                    </div>
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Sprint goal clarity</span>
                      <ThemedSelect
                        value={(formData.sprintHealth?.goalClarity as any) || 'NA'}
                        onChange={(value) => setFormData(prev => ({ ...prev, sprintHealth: { ...(prev.sprintHealth as any), goalClarity: value as any } }))}
                        options={healthWithNAOptions}
                        buttonClassName={cellSelectButtonClasses}
                        getOptionDotClassName={getHealthDotClassName}
                      />
                    </div>
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Sprint readiness</span>
                      <ThemedSelect
                        value={(formData.sprintHealth?.readiness as any) || 'NA'}
                        onChange={(value) => setFormData(prev => ({ ...prev, sprintHealth: { ...(prev.sprintHealth as any), readiness: value as any } }))}
                        options={healthWithNAOptions}
                        buttonClassName={cellSelectButtonClasses}
                        getOptionDotClassName={getHealthDotClassName}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className={sectionTitleClasses}>Team Health (Capacity)</div>
                  <div className="space-y-3">
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Planned team hours</span>
                      <input
                        type="number"
                        value={formData.capacity?.plannedHours ?? 0}
                        onChange={(e) => updateCapacity({ plannedHours: Number(e.target.value) })}
                        className={cellInputClasses}
                      />
                    </div>
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Committed team hours</span>
                      <input
                        type="number"
                        value={formData.capacity?.committedHours ?? 0}
                        onChange={(e) => updateCapacity({ committedHours: Number(e.target.value) })}
                        className={cellInputClasses}
                      />
                    </div>
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Surplus/Deficit (hrs)</span>
                      <input
                        value={formData.capacity?.surplusDeficitHours ?? 0}
                        readOnly
                        className={`${cellInputClasses} bg-slate-50 text-slate-600`}
                      />
                    </div>
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Load status</span>
                      <ThemedSelect
                        value={formData.capacity?.loadStatus ?? LoadStatus.NORMAL}
                        onChange={(value) => updateCapacity({ loadStatus: value as LoadStatus })}
                        options={loadStatusOptions}
                        buttonClassName={cellSelectButtonClasses}
                        getOptionDotClassName={getLoadStatusDotClassName}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className={sectionTitleClasses}>Team Strength</div>
                  <div className="space-y-3">
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Active contributors</span>
                      <input
                        value={formData.strength?.activeContributorNames || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, strength: { ...(prev.strength as any), activeContributorNames: e.target.value } }))}
                        className={cellInputClasses}
                        placeholder="e.g., Rahul, Priya"
                      />
                    </div>
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Critical role gaps</span>
                      <ThemedSelect
                        value={(formData.strength?.criticalRoleGaps ?? false) ? 'YES' : 'NO'}
                        onChange={(value) =>
                          setFormData(prev => {
                            const nextCritical = value === 'YES';
                            return {
                              ...prev,
                              strength: {
                                ...(prev.strength as any),
                                criticalRoleGaps: nextCritical,
                                gapNotes: nextCritical ? (prev.strength as any)?.gapNotes ?? '' : '',
                              },
                            };
                          })
                        }
                        options={yesNoOptions}
                        buttonClassName={cellSelectButtonClasses}
                      />
                    </div>
                    {(formData.strength?.criticalRoleGaps ?? false) ? (
                      <div className={fieldRowClasses}>
                        <span className={fieldLabelClasses}>Gap notes</span>
                        <input
                          value={formData.strength?.gapNotes || ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, strength: { ...(prev.strength as any), gapNotes: e.target.value } }))}
                          className={cellInputClasses}
                          placeholder="e.g., Need 1 automation engineer"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className={sectionTitleClasses}>UE/D Health</div>
                  <div className="space-y-3">
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Last discussion</span>
                      <input
                        value={formData.uedHealth?.lastDiscussion || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, uedHealth: { ...(prev.uedHealth as any), lastDiscussion: e.target.value } }))}
                        className={cellInputClasses}
                        placeholder="e.g., 2026-02-07"
                      />
                    </div>
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Days since last</span>
                      <input
                        value={formData.uedHealth?.daysSinceLast || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, uedHealth: { ...(prev.uedHealth as any), daysSinceLast: e.target.value } }))}
                        className={cellInputClasses}
                        placeholder="e.g., 3"
                      />
                    </div>
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Next scheduled</span>
                      <input
                        value={formData.uedHealth?.nextScheduled || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, uedHealth: { ...(prev.uedHealth as any), nextScheduled: e.target.value } }))}
                        className={cellInputClasses}
                        placeholder="e.g., 2026-02-20"
                      />
                    </div>
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Data available</span>
                      <ThemedSelect
                        value={(formData.uedHealth?.dataAvailable ?? false) ? 'YES' : 'NO'}
                        onChange={(value) => setFormData(prev => ({ ...prev, uedHealth: { ...(prev.uedHealth as any), dataAvailable: value === 'YES' } }))}
                        options={yesNoOptions}
                        buttonClassName={cellSelectButtonClasses}
                      />
                    </div>
                    <div className={fieldRowClasses}>
                      <span className={fieldLabelClasses}>Status</span>
                      <ThemedSelect
                        value={(formData.uedHealth?.status as any) || 'NA'}
                        onChange={(value) => setFormData(prev => ({ ...prev, uedHealth: { ...(prev.uedHealth as any), status: value as any } }))}
                        options={healthWithNAOptions}
                        buttonClassName={cellSelectButtonClasses}
                        getOptionDotClassName={getHealthDotClassName}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className={sectionTitleClasses}>Bottlenecks (Top 3)</div>
                    <button
                      type="button"
                      onClick={addBottleneckRow}
                      className={actionButtonClasses}
                    >
                      Add row
                    </button>
                  </div>
                  <ol className="space-y-3 list-decimal ml-5">
                    {(formData.bottlenecks || []).map((b, idx) => (
                      <li key={idx}>
                        <div className="flex items-center gap-3">
                          <input
                            value={b}
                            onChange={(e) => {
                              const value = e.target.value;
                              setFormData(prev => {
                                const next = [...(prev.bottlenecks || [])];
                                next[idx] = value;
                                return { ...prev, bottlenecks: next };
                              });
                            }}
                            className={cellInputClasses}
                            placeholder="e.g., Staging env instability"
                          />
                          {idx >= BOTTLENECK_ROWS && (formData.bottlenecks || []).length > BOTTLENECK_ROWS && (
                            <button
                              type="button"
                              onClick={() => removeBottleneckRow(idx)}
                              className={removeButtonClasses}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className={sectionTitleClasses}>Decisions Pending (Top 3)</div>
                    <button
                      type="button"
                      onClick={addDecisionRow}
                      className={actionButtonClasses}
                    >
                      Add row
                    </button>
                  </div>
                  <ol className="space-y-4 list-decimal ml-5">
                    {(formData.decisions || []).map((d, idx) => (
                      <li key={idx}>
                        <div className="flex items-center gap-3">
                          <input
                            value={d.decisionText}
                            onChange={(e) => {
                              const value = e.target.value;
                              setFormData(prev => {
                                const next = [...(prev.decisions || [])];
                                next[idx] = { ...next[idx], decisionText: value };
                                return { ...prev, decisions: next };
                              });
                            }}
                            className={cellInputClasses}
                            placeholder="e.g., Approve extra test devices"
                          />
                          {idx >= DECISION_ROWS && (formData.decisions || []).length > DECISION_ROWS ? (
                            <button
                              type="button"
                              onClick={() => removeDecisionRow(idx)}
                              className={removeButtonClasses}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-[#073D44] to-[#407B7E] flex items-center justify-between">
            <div className={pageTitleOnColorClasses}>Top Team Threads (Cognitive Load)</div>
            <button
              type="button"
              onClick={addThreadRow}
              className={headerActionButtonClasses}
            >
              Add row
            </button>
          </div>
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50">
                  <tr className="text-[11px] text-slate-600">
                    <th className="px-3 py-3 font-semibold w-[160px]">Product</th>
                    <th className="px-3 py-3 font-semibold">Thread</th>
                    <th className="px-3 py-3 font-semibold w-[180px]">Owner</th>
                    <th className="px-3 py-3 font-semibold w-[160px]">Status</th>
                    <th className="px-3 py-3 font-semibold w-[96px] text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {(formData.threads || []).map((t, idx) => (
                    <tr key={idx} className="border-t border-slate-200">
                      <td className="px-3 py-3">
                        <input
                          value={t.product || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData(prev => {
                              const next = [...(prev.threads || [])];
                              next[idx] = { ...next[idx], product: value };
                              return { ...prev, threads: next };
                            });
                          }}
                          className={cellInputClasses}
                          placeholder={`e.g., ${reportProject?.code || 'PALV2'}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          value={t.thread}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFormData(prev => {
                              const next = [...(prev.threads || [])];
                              next[idx] = { ...next[idx], thread: value };
                              return { ...prev, threads: next };
                            });
                          }}
                          className={cellInputClasses}
                          placeholder="e.g., Database optimization research"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <ThemedSelect
                          value={t.ownerId}
                          onChange={(ownerId) => {
                            setFormData(prev => {
                              const next = [...(prev.threads || [])];
                              next[idx] = { ...next[idx], ownerId };
                              return { ...prev, threads: next };
                            });
                          }}
                          options={ownerOptions}
                          placeholder="Select owner"
                          buttonClassName={cellSelectButtonClasses}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <ThemedSelect
                          value={t.status}
                          onChange={(value) => {
                            setFormData(prev => {
                              const next = [...(prev.threads || [])];
                              next[idx] = { ...next[idx], status: value as ThreadStatus };
                              return { ...prev, threads: next };
                            });
                          }}
                          options={threadStatusOptions}
                          buttonClassName={cellSelectButtonClasses}
                          getOptionDotClassName={getThreadStatusDotClassName}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {idx >= THREAD_ROWS && (formData.threads || []).length > THREAD_ROWS && (
                          <button
                            type="button"
                            onClick={() => removeThreadRow(idx)}
                            className={removeButtonClasses}
                          >
                            Remove
                          </button>
                        )}
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

export default EditorView;
