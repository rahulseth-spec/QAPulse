import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import { 
  WeeklyReport, Project, User, ReportStatus, GoalRow, DecisionItem,
  HealthStatus, ConfidenceLevel, LoadStatus, OwnerRole,
  ThreadStatus,
  ExecutionReadinessSlide
} from '../types';
import { formatISODate, formatLocalISODate, getISOWeek, getMonthName, getWeekOfMonth, parseISODateToLocal } from '../utils';
import { ThemedSelect, type ThemedSelectOption } from '../components/ThemedSelect';

interface EditorProps {
  onSave: (report: WeeklyReport) => void;
  user: User;
  projects: Project[];
  users: User[];
  reports?: WeeklyReport[];
  mode?: 'create' | 'edit' | 'view';
}

const GOAL_ROWS = 1;
const BOTTLENECK_ROWS = 3;
const DECISION_ROWS = 3;
const THREAD_ROWS = 1;

const EditorView: React.FC<EditorProps> = ({ onSave, user, projects, users, reports = [], mode: modeProp }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isEditing = !!id;
  const firstErrorRef = useRef<HTMLDivElement>(null);
  const existingForEdit = isEditing ? reports.find(r => r.id === id) : undefined;
  const resolvedMode = modeProp ?? (isEditing ? 'edit' : 'create');
  const isViewMode = resolvedMode === 'view';
  const canManage = isViewMode ? false : (!isEditing || (existingForEdit?.createdBy === user.id));
  const isOverallMode = (existingForEdit?.scope === 'OVERALL') || (new URLSearchParams(location.search).get('mode') === 'overall');
  
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
    const mode = queryParams.get('mode');
    const isOverall = mode === 'overall';
    const initialProjectId = isOverall ? '' : (queryParams.get('projectId') || projects[0]?.id || '');
    const initialStartDate = queryParams.get('startDate') || todayISO;
    const initialEndDate = queryParams.get('endDate') || addDaysISO(initialStartDate, 4);

    const base: Partial<WeeklyReport> = {
      projectId: initialProjectId,
      scope: isOverall ? 'OVERALL' : 'PROJECT',
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

    if (!isOverall) return base;

    const slide: ExecutionReadinessSlide = {
      projectId: '',
      projectNameOverride: '',
      capacity: { plannedHours: 40, committedHours: 40, surplusDeficitHours: 0, loadStatus: LoadStatus.NORMAL },
      strength: { activeContributors: 0, activeContributorNames: '', criticalRoleGaps: false, gapNotes: '' },
      sprintHealth: { startDate: initialStartDate, goalClarity: HealthStatus.GREEN, readiness: HealthStatus.GREEN },
      bottlenecks: padArray([], BOTTLENECK_ROWS, () => ''),
      decisions: padArray([], DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' })),
    };
    return {
      ...base,
      projectId: '',
      executionReadinessSlides: [slide],
      capacity: slide.capacity,
      strength: slide.strength,
      sprintHealth: slide.sprintHealth,
    };
  };

  const [formData, setFormData] = useState<Partial<WeeklyReport>>(() => buildNewReportFormData(location.search));

  const [lastSavedTime, setLastSavedTime] = useState<string>(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const isImportFlow = !isEditing && new URLSearchParams(location.search).get('import') === '1';
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string>('');
  const [importInfo, setImportInfo] = useState<{ fileName: string; extractedAt: string; executionSlides: number; goals: number; threads: number } | null>(null);
  const autoImportRef = useRef(false);

  const normalizeExistingForEditor = (existing: WeeklyReport): Partial<WeeklyReport> => {
    const goals = padArray(existing.goals, GOAL_ROWS, () => ({ goal: '', successMetric: '', health: HealthStatus.GREEN, confidence: ConfidenceLevel.MED }));
    const bottlenecks = padArray(existing.bottlenecks, BOTTLENECK_ROWS, () => '');
    const decisions = padArray(existing.decisions, DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' }));
    const threads = padArray(existing.threads, THREAD_ROWS, () => ({ product: '', thread: '', ownerId: user.id, status: ThreadStatus.IN_PROGRESS }));
    const plannedHours = existing.capacity?.plannedHours ?? 0;
    const committedHours = existing.capacity?.committedHours ?? 0;
    const surplusDeficitHours = plannedHours - committedHours;
    const normalizedScope = existing.scope ?? (existing.executionReadinessSlides?.length ? 'OVERALL' : 'PROJECT');
    const normalizedSlides = (existing.executionReadinessSlides || []).map(s => {
      const p = s.capacity?.plannedHours ?? 0;
      const c = s.capacity?.committedHours ?? 0;
      const slideBottlenecks = padArray((s as any).bottlenecks ?? existing.bottlenecks ?? [], BOTTLENECK_ROWS, () => '');
      const slideDecisions = padArray((s as any).decisions ?? existing.decisions ?? [], DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' }));
      return {
        projectId: s.projectId || '',
        projectNameOverride: s.projectNameOverride || '',
        capacity: {
          plannedHours: p,
          committedHours: c,
          surplusDeficitHours: p - c,
          loadStatus: s.capacity?.loadStatus ?? LoadStatus.NORMAL,
        },
        strength: {
          activeContributors: s.strength?.activeContributors ?? 0,
          activeContributorNames: s.strength?.activeContributorNames ?? '',
          criticalRoleGaps: s.strength?.criticalRoleGaps ?? false,
          gapNotes: s.strength?.gapNotes ?? '',
        },
        sprintHealth: {
          startDate: s.sprintHealth?.startDate ?? existing.startDate,
          goalClarity: s.sprintHealth?.goalClarity ?? HealthStatus.GREEN,
          readiness: s.sprintHealth?.readiness ?? HealthStatus.GREEN,
        },
        bottlenecks: slideBottlenecks,
        decisions: slideDecisions,
      } satisfies ExecutionReadinessSlide;
    });
    const effectiveSlides =
      normalizedScope === 'OVERALL'
        ? (normalizedSlides.length
            ? normalizedSlides
            : [
                {
                  projectId: '',
                  projectNameOverride: '',
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
                  bottlenecks: bottlenecks,
                  decisions: decisions,
                } satisfies ExecutionReadinessSlide,
              ])
        : undefined;

    return {
      ...existing,
      scope: normalizedScope,
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
      executionReadinessSlides: effectiveSlides,
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
      if (existingForEdit) setFormData(normalizeExistingForEditor(existingForEdit));
    }
  }, [existingForEdit, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    if (!isViewMode && existingForEdit && !canManage) {
      navigate(`/report/${existingForEdit.id}`, { replace: true });
    }
  }, [canManage, existingForEdit, isEditing, isViewMode, navigate]);

  useEffect(() => {
    if (isEditing) return;
    setFormData(buildNewReportFormData(location.search));
    setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }, [isEditing, location.search]);

  useEffect(() => {
    if (!isViewMode) return;
    if (!existingForEdit?.updatedAt) return;
    setLastSavedTime(formatISODate(existingForEdit.updatedAt));
  }, [existingForEdit?.updatedAt, isViewMode]);

  const computeActiveContributorCount = (names: string) => {
    const parts = names
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    return parts.length;
  };

  const normalizeName = (value: string) => (value || '').trim().toLowerCase();

  const parseHealthStatus = (value: string): HealthStatus | 'NA' => {
    const v = normalizeName(value);
    if (v === 'na' || v === 'n/a') return 'NA';
    if (v.startsWith('g')) return HealthStatus.GREEN;
    if (v.startsWith('y')) return HealthStatus.YELLOW;
    if (v.startsWith('r')) return HealthStatus.RED;
    return 'NA';
  };

  const parseLoadStatus = (value: string): LoadStatus => {
    const v = normalizeName(value);
    if (v.includes('over')) return LoadStatus.OVERLOADED;
    if (v.includes('under')) return LoadStatus.UNDERUTILIZED;
    return LoadStatus.NORMAL;
  };

  const matchUserIdByName = (name: string) => {
    const n = normalizeName(name);
    const match = users.find(u => normalizeName(u.name) === n);
    return match?.id || user.id;
  };

  const matchProjectIdByName = (name: string) => {
    const n = normalizeName(name);
    if (!n) return '';
    const exact = projects.find(p => normalizeName(p.name) === n);
    if (exact) return exact.id;
    const loose = projects.find(p => normalizeName(p.name).includes(n) || n.includes(normalizeName(p.name)));
    return loose?.id || '';
  };

  const extractSlideTextFromXml = (xml: string) => {
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const paragraphs = Array.from(doc.getElementsByTagName('a:p'));
      if (paragraphs.length === 0) {
        const runs = Array.from(doc.getElementsByTagName('a:t')).map(n => n.textContent || '');
        return runs.join(' ').replace(/\s+/g, ' ').trim();
      }
      const lines = paragraphs
        .map(p => Array.from(p.getElementsByTagName('a:t')).map(n => n.textContent || '').join(''))
        .map(s => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      return lines.join('\n').trim();
    } catch {
      const matches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map(m => (m[1] || '').replace(/<[^>]+>/g, ''));
      return matches.join(' ').replace(/\s+/g, ' ').trim();
    }
  };

  const parseGoalsFromText = (text: string): GoalRow[] => {
    const lines = (text || '').split('\n').map(s => s.trim()).filter(Boolean);
    const out: GoalRow[] = [];
    for (const line of lines) {
      const m = line.match(/^\d+\.\s*(.+?)\s*—\s*(.+?)\s*\(Health:\s*([A-Za-z]+)\s*,\s*Conf:\s*([A-Za-z]+)\s*\)\s*$/);
      if (!m) continue;
      const goal = (m[1] || '').trim();
      const successMetric = (m[2] || '').trim();
      const health = parseHealthStatus(m[3] || 'NA');
      const confRaw = normalizeName(m[4] || '');
      const confidence = confRaw.startsWith('h') ? ConfidenceLevel.HIGH : confRaw.startsWith('l') ? ConfidenceLevel.LOW : ConfidenceLevel.MED;
      if (!goal && !successMetric) continue;
      if (health === 'NA') continue;
      out.push({ goal, successMetric, health: health as HealthStatus, confidence });
    }
    return out;
  };

  const parseThreadsFromText = (text: string) => {
    const lines = (text || '').split('\n').map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const m = line.match(/^\d+\.\s*(.*?)\s*—\s*(.*?)\s*—\s*(.*?)\s*\((.*?)\)\s*$/);
      if (!m) continue;
      const product = (m[1] || '').trim();
      const thread = (m[2] || '').trim();
      const ownerName = (m[3] || '').trim();
      const statusRaw = normalizeName(m[4] || '');
      const status =
        statusRaw.includes('blocked')
          ? ThreadStatus.BLOCKED
          : statusRaw.includes('not')
            ? ThreadStatus.NOT_STARTED
            : statusRaw.includes('complete')
              ? ThreadStatus.COMPLETED
              : ThreadStatus.IN_PROGRESS;
      if (!thread) continue;
      out.push({ product, thread, ownerId: matchUserIdByName(ownerName), status });
    }
    return out;
  };

  const tokenizeTextLines = (text: string) =>
    (text || '')
      .split('\n')
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

  const findHeaderIndex = (tokens: string[], header: string[]) => {
    const h = header.map(normalizeName);
    for (let i = 0; i <= tokens.length - h.length; i++) {
      let ok = true;
      for (let j = 0; j < h.length; j++) {
        if (normalizeName(tokens[i + j]) !== h[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  };

  const parseSimpleTable = (text: string, header: string[], columns: number, stopHeaders: string[]) => {
    const tokens = tokenizeTextLines(text);
    const startIdx = findHeaderIndex(tokens, header);
    if (startIdx < 0) return [];
    const stop = stopHeaders.map(normalizeName);
    const rows: string[][] = [];
    let i = startIdx + header.length;
    while (i < tokens.length) {
      const t = tokens[i];
      const n = normalizeName(t);
      if (stop.includes(n)) break;
      if (n === normalizeName(header[0])) break;
      const row = tokens.slice(i, i + columns);
      if (row.length < columns) break;
      rows.push(row);
      i += columns;
    }
    return rows;
  };

  const parseGoalsTableFromText = (text: string): GoalRow[] => {
    const rows =
      parseSimpleTable(text, ['Goal', 'Success Metric', 'Health', 'Confidence'], 4, [
        'bottlenecks',
        'decisions pending (top 3)',
        'decisions pending',
        'top team threads (cognitive load)',
        'execution readiness & friction',
        'sprint health',
      ]) ||
      [];
    const rowsAlt =
      rows.length === 0
        ? parseSimpleTable(text, ['Goal', 'Success Metrics', 'Health', 'Confidence'], 4, [
            'bottlenecks',
            'decisions pending (top 3)',
            'decisions pending',
            'top team threads (cognitive load)',
            'execution readiness & friction',
            'sprint health',
          ])
        : [];
    const finalRows = rows.length ? rows : rowsAlt;
    const out: GoalRow[] = [];
    for (const [goalRaw, metricRaw, healthRaw, confRaw] of finalRows) {
      const goal = (goalRaw || '').trim();
      const successMetric = (metricRaw || '').trim();
      const health = parseHealthStatus(healthRaw || 'NA');
      const conf = normalizeName(confRaw || '');
      const confidence = conf.startsWith('h') ? ConfidenceLevel.HIGH : conf.startsWith('l') ? ConfidenceLevel.LOW : ConfidenceLevel.MED;
      if (!goal && !successMetric) continue;
      if (health === 'NA') continue;
      out.push({ goal, successMetric, health: health as HealthStatus, confidence });
    }
    return out;
  };

  const parseThreadsTableFromText = (text: string) => {
    const rows = parseSimpleTable(text, ['Product', 'Thread', 'Owner', 'Status'], 4, [
      'goals & team health',
      'goals',
      'bottlenecks',
      'decisions pending (top 3)',
      'decisions pending',
      'execution readiness & friction',
    ]);
    const out = [];
    for (const [productRaw, threadRaw, ownerRaw, statusRaw] of rows) {
      const product = (productRaw || '').trim();
      const thread = (threadRaw || '').trim();
      const ownerName = (ownerRaw || '').trim();
      const s = normalizeName(statusRaw || '');
      const status =
        s.includes('blocked')
          ? ThreadStatus.BLOCKED
          : s.includes('not')
            ? ThreadStatus.NOT_STARTED
            : s.includes('complete')
              ? ThreadStatus.COMPLETED
              : ThreadStatus.IN_PROGRESS;
      if (!thread) continue;
      out.push({ product, thread, ownerId: matchUserIdByName(ownerName), status });
    }
    return out;
  };

  const parseListSection = (text: string, header: string) => {
    const lines = (text || '').split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const startIdx = lines.findIndex(l => normalizeName(l) === normalizeName(header));
    if (startIdx < 0) return [];
    const out: string[] = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      const n = normalizeName(l);
      if (n === 'bottlenecks' || n.startsWith('decisions pending') || n.includes('goals') || n.includes('top team threads') || n.includes('execution readiness')) break;
      const cleaned = l.replace(/^•\s*/, '').trim();
      const m = cleaned.match(/^\d+\.\s*(.+)$/);
      const value = (m ? m[1] : cleaned).trim();
      if (value) out.push(value);
      if (out.length >= 10) break;
    }
    return out;
  };

  const parseListSectionAny = (text: string, headers: string[]) => {
    for (const h of headers) {
      const parsed = parseListSection(text, h);
      if (parsed.length) return parsed;
    }
    return [];
  };

  const parseExecutionSlideFromText = (text: string): { slide: ExecutionReadinessSlide | null; uedHealth?: WeeklyReport['uedHealth'] } => {
    const lines = (text || '').split('\n').map(s => s.trim()).filter(Boolean);
    const titleLine = lines.find(l => l.toLowerCase().includes('execution readiness') && l.toLowerCase().includes('friction')) || '';
    const projectName = titleLine.replace(/Execution Readiness\s*&\s*Friction/i, '').trim();
    const projectId = matchProjectIdByName(projectName);

    const slide: ExecutionReadinessSlide = {
      projectId: projectId,
      projectNameOverride: projectName,
      capacity: { plannedHours: 40, committedHours: 40, surplusDeficitHours: 0, loadStatus: LoadStatus.NORMAL },
      strength: { activeContributors: 0, activeContributorNames: '', criticalRoleGaps: false, gapNotes: '' },
      sprintHealth: { startDate: formData.startDate || todayISO, goalClarity: HealthStatus.GREEN, readiness: HealthStatus.GREEN },
      bottlenecks: padArray([], BOTTLENECK_ROWS, () => ''),
      decisions: padArray([], DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' })),
    };

    let parsing: 'bottlenecks' | 'decisions' | '' = '';
    const bottlenecks: string[] = [];
    const decisions: string[] = [];
    let ued: WeeklyReport['uedHealth'] | undefined;
    for (const rawLine of lines) {
      const line = rawLine.replace(/^•\s*/, '').trim();
      if (!line) continue;

      if (/^Bottlenecks$/i.test(line)) {
        parsing = 'bottlenecks';
        continue;
      }
      if (/^Decisions Pending/i.test(line)) {
        parsing = 'decisions';
        continue;
      }

      const numberItem = line.match(/^\d+\.\s*(.+)$/);
      if (numberItem && parsing === 'bottlenecks') {
        bottlenecks.push((numberItem[1] || '').trim());
        continue;
      }
      if (numberItem && parsing === 'decisions') {
        decisions.push((numberItem[1] || '').trim());
        continue;
      }

      const kv = line.split(':');
      if (kv.length < 2) continue;
      const key = normalizeName(kv[0]);
      const value = kv.slice(1).join(':').trim();

      if (key.startsWith('sprint start date')) {
        slide.sprintHealth = { ...slide.sprintHealth, startDate: value || slide.sprintHealth.startDate };
        continue;
      }
      if (key.startsWith('sprint goal clarity')) {
        slide.sprintHealth = { ...slide.sprintHealth, goalClarity: parseHealthStatus(value) };
        continue;
      }
      if (key.startsWith('sprint readiness')) {
        slide.sprintHealth = { ...slide.sprintHealth, readiness: parseHealthStatus(value) };
        continue;
      }

      if (key.startsWith('planned team hours')) {
        const planned = Number(String(value).replace(/[^\d.-]/g, ''));
        if (Number.isFinite(planned)) slide.capacity = { ...slide.capacity, plannedHours: planned };
        continue;
      }
      if (key.startsWith('committed hours')) {
        const committed = Number(String(value).replace(/[^\d.-]/g, ''));
        if (Number.isFinite(committed)) slide.capacity = { ...slide.capacity, committedHours: committed };
        continue;
      }
      if (key.startsWith('load status')) {
        slide.capacity = { ...slide.capacity, loadStatus: parseLoadStatus(value) };
        continue;
      }

      if (key.startsWith('active contributors')) {
        slide.strength = { ...slide.strength, activeContributorNames: value };
        continue;
      }
      if (key.startsWith('critical role gaps')) {
        const v = normalizeName(value);
        slide.strength = { ...slide.strength, criticalRoleGaps: v.startsWith('y') || v === 'true' };
        continue;
      }

      if (key.startsWith('last discussion')) {
        ued = ued || { lastDiscussion: '', daysSinceLast: '', nextScheduled: '', dataAvailable: false, status: 'NA' };
        ued.lastDiscussion = value;
        continue;
      }
      if (key.startsWith('days since last')) {
        ued = ued || { lastDiscussion: '', daysSinceLast: '', nextScheduled: '', dataAvailable: false, status: 'NA' };
        ued.daysSinceLast = value;
        continue;
      }
      if (key.startsWith('next scheduled')) {
        ued = ued || { lastDiscussion: '', daysSinceLast: '', nextScheduled: '', dataAvailable: false, status: 'NA' };
        ued.nextScheduled = value;
        continue;
      }
      if (key.startsWith('data available')) {
        ued = ued || { lastDiscussion: '', daysSinceLast: '', nextScheduled: '', dataAvailable: false, status: 'NA' };
        const v = normalizeName(value);
        ued.dataAvailable = v.startsWith('y') || v === 'true';
        continue;
      }
      if (key === 'status') {
        ued = ued || { lastDiscussion: '', daysSinceLast: '', nextScheduled: '', dataAvailable: false, status: 'NA' };
        ued.status = parseHealthStatus(value);
        continue;
      }
    }

    const planned = slide.capacity.plannedHours ?? 0;
    const committed = slide.capacity.committedHours ?? 0;
    slide.capacity = { ...slide.capacity, surplusDeficitHours: planned - committed };
    const names = slide.strength.activeContributorNames || '';
    slide.strength = { ...slide.strength, activeContributors: computeActiveContributorCount(names) };

    slide.bottlenecks = padArray(bottlenecks.filter(Boolean), BOTTLENECK_ROWS, () => '');
    slide.decisions = padArray(decisions.filter(Boolean).map(d => ({ decisionText: d, ownerRole: OwnerRole.QA, dueDate: '' })), DECISION_ROWS, () => ({
      decisionText: '',
      ownerRole: OwnerRole.QA,
      dueDate: '',
    }));

    const hasAnyContent =
      (slide.projectNameOverride || '').trim() ||
      (slide.projectId || '').trim() ||
      (slide.strength.activeContributorNames || '').trim() ||
      slide.bottlenecks.some(b => b.trim()) ||
      slide.decisions.some(d => d.decisionText.trim());
    if (!hasAnyContent) return { slide: null };
    return { slide, uedHealth: ued };
  };

  const parsePptxToFormData = async (arrayBuffer: ArrayBuffer) => {
    const jszipMod: any = await import('jszip');
    const JSZip: any = jszipMod?.default ?? jszipMod;
    if (!JSZip || typeof JSZip.loadAsync !== 'function') {
      throw new Error('JSZip is not available');
    }
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slideFiles = Object.keys(zip.files)
      .filter(f => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
      .sort((a, b) => {
        const na = Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0);
        const nb = Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0);
        return na - nb;
      });

    const slideTexts: string[] = [];
    for (const f of slideFiles) {
      const xml = await zip.file(f)!.async('text');
      slideTexts.push(extractSlideTextFromXml(xml));
    }

    let goals: GoalRow[] = [];
    const executionSlides: ExecutionReadinessSlide[] = [];
    let uedHealth: WeeklyReport['uedHealth'] | undefined;
    let threads: any[] = [];
    let bottlenecks: string[] = [];
    let decisions: DecisionItem[] = [];

    for (const text of slideTexts) {
      const lower = (text || '').toLowerCase();
      if (goals.length === 0 && (lower.includes('goals') || (lower.includes('success metric') && lower.includes('confidence')))) {
        const parsed = parseGoalsFromText(text);
        const parsedTable = parsed.length ? [] : parseGoalsTableFromText(text);
        const next = parsed.length ? parsed : parsedTable;
        if (next.length) goals = next;
      }
      if (lower.includes('execution readiness') && lower.includes('friction')) {
        const parsed = parseExecutionSlideFromText(text);
        if (parsed.slide) executionSlides.push(parsed.slide);
        if (!uedHealth && parsed.uedHealth) uedHealth = parsed.uedHealth;
      }
      if (threads.length === 0 && (lower.includes('top team threads') || (lower.includes('product') && lower.includes('owner') && lower.includes('status')))) {
        const parsed = parseThreadsFromText(text);
        const parsedTable = parsed.length ? [] : parseThreadsTableFromText(text);
        const next = parsed.length ? parsed : parsedTable;
        if (next.length) threads = next;
      }

      if (bottlenecks.length === 0 && lower.includes('bottlenecks')) {
        const parsed = parseListSectionAny(text, ['Bottlenecks (Top 3)', 'Bottlenecks']);
        if (parsed.length) bottlenecks = parsed;
      }

      if (decisions.length === 0 && lower.includes('decisions pending')) {
        const list = parseListSectionAny(text, ['Decisions Pending (Top 3)', 'Decisions Pending']);
        if (list.length) {
          decisions = list.map(d => ({ decisionText: d, ownerRole: OwnerRole.QA, dueDate: '' }));
        }
      }
    }

    return { goals, executionSlides, uedHealth, threads, bottlenecks, decisions };
  };

  const applyImportedData = (
    fileName: string,
    parsed: {
      goals: GoalRow[];
      executionSlides: ExecutionReadinessSlide[];
      uedHealth?: WeeklyReport['uedHealth'];
      threads: any[];
      bottlenecks: string[];
      decisions: DecisionItem[];
    },
  ) => {
    setFormData(prev => {
      const nextGoals =
        parsed.goals.length > 0
          ? padArray(parsed.goals, GOAL_ROWS, () => ({ goal: '', successMetric: '', health: HealthStatus.GREEN, confidence: ConfidenceLevel.MED }))
          : prev.goals;

      const nextThreads =
        parsed.threads.length > 0
          ? padArray(parsed.threads, THREAD_ROWS, () => ({ product: '', thread: '', ownerId: user.id, status: ThreadStatus.IN_PROGRESS }))
          : prev.threads;

      const nextBottlenecks = parsed.bottlenecks.length > 0 ? padArray(parsed.bottlenecks, BOTTLENECK_ROWS, () => '') : prev.bottlenecks;
      const nextDecisions =
        parsed.decisions.length > 0
          ? padArray(parsed.decisions, DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' }))
          : prev.decisions;

      if (isOverallMode) {
        const ensuredSlides = parsed.executionSlides.length
          ? parsed.executionSlides
          : prev.executionReadinessSlides || [];
        const primary = ensuredSlides[0];
        const nextSlides = ensuredSlides.length ? ensuredSlides : prev.executionReadinessSlides;
        return {
          ...prev,
          goals: nextGoals,
          executionReadinessSlides: nextSlides,
          capacity: primary?.capacity || prev.capacity,
          strength: primary?.strength || prev.strength,
          sprintHealth: primary?.sprintHealth || prev.sprintHealth,
          bottlenecks: nextBottlenecks || primary?.bottlenecks || prev.bottlenecks,
          decisions: nextDecisions || primary?.decisions || prev.decisions,
          uedHealth: parsed.uedHealth || prev.uedHealth,
          threads: nextThreads,
        };
      }

      const primary = parsed.executionSlides[0];
      const importedProjectId = (primary?.projectId || '').trim();
      const nextProjectId = importedProjectId || prev.projectId || '';
      return {
        ...prev,
        projectId: nextProjectId,
        goals: nextGoals,
        capacity: primary?.capacity || prev.capacity,
        strength: primary?.strength || prev.strength,
        sprintHealth: primary?.sprintHealth || prev.sprintHealth,
        bottlenecks: nextBottlenecks || primary?.bottlenecks || prev.bottlenecks,
        decisions: nextDecisions || primary?.decisions || prev.decisions,
        uedHealth: parsed.uedHealth || prev.uedHealth,
        threads: nextThreads,
      };
    });

    setImportInfo({
      fileName,
      extractedAt: new Date().toLocaleString(),
      executionSlides: parsed.executionSlides.length,
      goals: parsed.goals.length,
      threads: parsed.threads.length,
    });
  };

  const handleImportFiles = async (files: FileList | File[] | null) => {
    try {
      if (!files || (Array.isArray(files) && files.length === 0) || (!Array.isArray(files) && files.length === 0)) return;
      setIsImporting(true);
      setImportError('');
      setImportInfo(null);

      const list = Array.isArray(files) ? files : Array.from(files);
      const pptx = list.find(f => /\.pptx$/i.test(f.name));
      const ppt = list.find(f => /\.ppt$/i.test(f.name));
      if (!pptx && ppt) {
        setImportError('Old .ppt files are not supported. Please save/export as .pptx and upload again.');
        return;
      }
      if (!pptx) {
        setImportError('Please upload a .pptx file.');
        return;
      }

      const buf = await pptx.arrayBuffer();
      const parsed = await parsePptxToFormData(buf);
      applyImportedData(pptx.name, parsed);
    } catch {
      setImportError('Import failed. Please upload a PPT exported from this app.');
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (!isImportFlow) return;
    if (isEditing || isViewMode) return;
    if (autoImportRef.current) return;

    const fromWindow = (window as any).__QAPULSE_IMPORT__ as { buf?: ArrayBuffer; name?: string } | undefined;
    const winBuf = fromWindow?.buf;
    const winName = fromWindow?.name;

    if (winBuf && winBuf.byteLength) {
      autoImportRef.current = true;
      (window as any).__QAPULSE_IMPORT__ = undefined;
      (async () => {
        try {
          setIsImporting(true);
          setImportError('');
          setImportInfo(null);
          const parsed = await parsePptxToFormData(winBuf);
          applyImportedData(winName || 'import.pptx', parsed);
        } catch {
          setImportError('Import failed. Please upload a PPT exported from this app.');
        } finally {
          setIsImporting(false);
        }
      })();
      return;
    }

    const state = location.state as any;
    const buf = state?.importPptx as ArrayBuffer | undefined;
    const name = state?.importPptxName as string | undefined;
    if (buf && buf.byteLength) {
      autoImportRef.current = true;
      (async () => {
        try {
          setIsImporting(true);
          setImportError('');
          setImportInfo(null);
          const parsed = await parsePptxToFormData(buf);
          applyImportedData(name || 'import.pptx', parsed);
        } catch {
          setImportError('Import failed. Please upload a PPT exported from this app.');
        } finally {
          setIsImporting(false);
        }
      })();
    }
  }, [isEditing, isImportFlow, isViewMode, location.state]);

  const headerIsValid = (() => {
    if (!formData.startDate || !formData.endDate) return false;
    if (!isOverallMode && !formData.projectId) return false;
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

    if (isOverallMode) {
      const slides = formData.executionReadinessSlides || [];
      if (slides.length < 1) return false;
      for (const s of slides) {
        const hasProjectName = (s.projectNameOverride || '').trim().length > 0;
        const hasProjectId = (s.projectId || '').trim().length > 0;
        if (!hasProjectName && !hasProjectId) return false;
        if (!Number.isFinite(s.capacity?.plannedHours) || (s.capacity?.plannedHours ?? 0) <= 0) return false;
        if (!Number.isFinite(s.capacity?.committedHours) || (s.capacity?.committedHours ?? 0) <= 0) return false;
        if (!s.capacity?.loadStatus) return false;
        if (!s.strength?.activeContributorNames?.trim()) return false;
        if (computeActiveContributorCount(s.strength.activeContributorNames) <= 0) return false;
        if (!s.sprintHealth?.startDate) return false;
        if (s.sprintHealth.goalClarity === 'NA' || !s.sprintHealth.goalClarity) return false;
        if (s.sprintHealth.readiness === 'NA' || !s.sprintHealth.readiness) return false;
      }
    } else {
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
    }

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
    if (!canManage) return;
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
    const projectName = isOverallMode ? 'All Projects' : projects.find(p => p.id === formData.projectId)?.name;
    const existing = isEditing ? existingForEdit : undefined;
    if (isEditing && (!existing || existing.createdBy !== user.id)) return;
    const createdBy = existing?.createdBy || user.id;
    const createdAt = existing?.createdAt || new Date().toISOString();
    const computedSlides = isOverallMode
      ? (formData.executionReadinessSlides || []).map(s => {
          const plannedHours = s.capacity?.plannedHours ?? 0;
          const committedHours = s.capacity?.committedHours ?? 0;
          const activeContributors = computeActiveContributorCount(s.strength?.activeContributorNames || '');
          const slideBottlenecks = padArray(s.bottlenecks || [], BOTTLENECK_ROWS, () => '');
          const slideDecisions = padArray(s.decisions || [], DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' }));
          return {
            projectId: s.projectId,
            projectNameOverride: s.projectNameOverride || '',
            capacity: {
              plannedHours,
              committedHours,
              surplusDeficitHours: plannedHours - committedHours,
              loadStatus: s.capacity?.loadStatus ?? LoadStatus.NORMAL,
            },
            strength: {
              ...s.strength,
              activeContributors,
            },
            sprintHealth: s.sprintHealth,
            bottlenecks: slideBottlenecks,
            decisions: slideDecisions,
          } satisfies ExecutionReadinessSlide;
        })
      : undefined;

    const primarySlide = computedSlides?.[0];
    const computedActive = computeActiveContributorCount(
      (isOverallMode ? primarySlide?.strength?.activeContributorNames : formData.strength?.activeContributorNames) || '',
    );

    const newReport: WeeklyReport = {
      id: isEditing ? id! : `r-${Date.now()}`,
      projectId: isOverallMode ? '' : (formData.projectId || ''),
      scope: isOverallMode ? 'OVERALL' : 'PROJECT',
      title: formatTitle(projectName, formData.startDate!),
      startDate: formData.startDate!,
      endDate: formData.endDate!,
      isoWeek,
      year: startDateObj.getFullYear(),
      month,
      weekOfMonth,
      status,
      goals: formData.goals || [],
      capacity: (isOverallMode ? primarySlide?.capacity : formData.capacity)!,
      strength: {
        ...(isOverallMode ? primarySlide?.strength : formData.strength)!,
        activeContributors: computedActive,
      },
      decisions: (isOverallMode ? primarySlide?.decisions : formData.decisions) || [],
      sprintHealth: (isOverallMode ? primarySlide?.sprintHealth : formData.sprintHealth)!,
      executionReadinessSlides: computedSlides,
      uedHealth: formData.uedHealth!,
      bottlenecks: (isOverallMode ? primarySlide?.bottlenecks : formData.bottlenecks) || [],
      threads: formData.threads || [],
      createdBy,
      updatedBy: user.id,
      publishedBy: status === ReportStatus.PUBLISHED ? user.id : undefined,
      createdAt,
      updatedAt: new Date().toISOString(),
    };

    onSave(newReport);
    setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    if (status === ReportStatus.PUBLISHED) {
      navigate(`/report/${newReport.id}`);
    } else {
      navigate('/weekly-reports');
    }
  };

  const projectOptions: ThemedSelectOption[] = projects.map(p => ({ value: p.id, label: p.name }));
  const overallProjectOptions: ThemedSelectOption[] = [{ value: '', label: 'Select project (optional)' }, ...projectOptions];
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
  const pageTitleOnColorClasses = "text-[14px] font-bold text-[#073D44] tracking-tight";
  const fieldRowClasses = "grid grid-cols-1 sm:grid-cols-[170px_1fr] items-center gap-2 sm:gap-3";
  const fieldLabelClasses = "text-[12px] text-slate-500";
  const actionButtonClasses =
    "h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors";
  const headerActionButtonClasses =
    "h-10 px-4 rounded-xl bg-white/60 border border-[#073D44]/20 text-[#073D44] font-semibold text-[13px] hover:bg-white/80 transition-colors";
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

  const updateExecutionSlide = (idx: number, partial: Partial<ExecutionReadinessSlide>) => {
    setFormData(prev => {
      const current = [...(prev.executionReadinessSlides || [])];
      if (!current[idx]) return prev;
      const prevSlide = current[idx];

      const plannedHours = partial.capacity?.plannedHours ?? prevSlide.capacity.plannedHours ?? 0;
      const committedHours = partial.capacity?.committedHours ?? prevSlide.capacity.committedHours ?? 0;

      const nextSlide: ExecutionReadinessSlide = {
        projectId: partial.projectId ?? prevSlide.projectId,
        projectNameOverride: partial.projectNameOverride ?? prevSlide.projectNameOverride,
        capacity: {
          plannedHours,
          committedHours,
          surplusDeficitHours: plannedHours - committedHours,
          loadStatus: partial.capacity?.loadStatus ?? prevSlide.capacity.loadStatus,
        },
        strength: {
          activeContributors: partial.strength?.activeContributors ?? prevSlide.strength.activeContributors ?? 0,
          activeContributorNames: partial.strength?.activeContributorNames ?? prevSlide.strength.activeContributorNames,
          criticalRoleGaps: partial.strength?.criticalRoleGaps ?? prevSlide.strength.criticalRoleGaps,
          gapNotes: partial.strength?.gapNotes ?? prevSlide.strength.gapNotes,
        },
        sprintHealth: {
          startDate: partial.sprintHealth?.startDate ?? prevSlide.sprintHealth.startDate,
          goalClarity: partial.sprintHealth?.goalClarity ?? prevSlide.sprintHealth.goalClarity,
          readiness: partial.sprintHealth?.readiness ?? prevSlide.sprintHealth.readiness,
        },
        bottlenecks: partial.bottlenecks ?? prevSlide.bottlenecks,
        decisions: partial.decisions ?? prevSlide.decisions,
      };

      current[idx] = nextSlide;
      const next: Partial<WeeklyReport> = { ...prev, executionReadinessSlides: current };
      if (idx === 0) {
        next.capacity = nextSlide.capacity;
        next.strength = nextSlide.strength;
        next.sprintHealth = nextSlide.sprintHealth;
        next.bottlenecks = nextSlide.bottlenecks;
        next.decisions = nextSlide.decisions;
      }
      return next;
    });
  };

  const addExecutionSlide = () => {
    setFormData(prev => {
      const current = [...(prev.executionReadinessSlides || [])];
      const base = current[current.length - 1] || {
        projectId: '',
        projectNameOverride: '',
        capacity: prev.capacity || { plannedHours: 40, committedHours: 40, surplusDeficitHours: 0, loadStatus: LoadStatus.NORMAL },
        strength: prev.strength || { activeContributors: 0, activeContributorNames: '', criticalRoleGaps: false, gapNotes: '' },
        sprintHealth: prev.sprintHealth || { startDate: prev.startDate || todayISO, goalClarity: HealthStatus.GREEN, readiness: HealthStatus.GREEN },
        bottlenecks: padArray(prev.bottlenecks || [], BOTTLENECK_ROWS, () => ''),
        decisions: padArray(prev.decisions || [], DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' })),
      };

      current.push({
        ...base,
        projectId: base.projectId || projects[0]?.id || '',
      });

      return { ...prev, executionReadinessSlides: current };
    });
  };

  const removeExecutionSlide = (idx: number) => {
    setFormData(prev => {
      const current = [...(prev.executionReadinessSlides || [])];
      if (current.length <= 1) return prev;
      current.splice(idx, 1);
      const next: Partial<WeeklyReport> = { ...prev, executionReadinessSlides: current };
      if (idx === 0 && current[0]) {
        next.capacity = current[0].capacity;
        next.strength = current[0].strength;
        next.sprintHealth = current[0].sprintHealth;
        next.bottlenecks = current[0].bottlenecks;
        next.decisions = current[0].decisions;
      }
      return next;
    });
  };

  const reportProject = projects.find(p => p.id === formData.projectId);
  const reportTitle = formData.startDate
    ? formatTitle(isOverallMode ? 'All Projects' : reportProject?.name, formData.startDate)
    : 'Weekly Snapshot';

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
            <h1 className="text-[28px] leading-[36px] font-bold tracking-tight">
              {isViewMode ? 'Weekly Report' : isEditing ? 'Edit Weekly Report' : 'Create Weekly Report'}
            </h1>
            <p className="mt-2 text-[15px] leading-[24px] text-white/80">Landscape report template with required publish validation.</p>
            {isEditing && !isViewMode && !canManage && (
              <p className="mt-2 text-[13px] leading-[20px] text-white/90 font-semibold">
                You do not have access to edit this report.
              </p>
            )}
          </div>
          {!isViewMode && (
            <div className="flex gap-3 shrink-0">
              <button
                className={`h-12 px-5 rounded-xl text-white font-semibold text-[14px] border transition-colors ${
                  draftIsValid && headerIsValid ? 'bg-white/10 border-white/15 hover:bg-white/15' : 'bg-white/5 border-white/10 opacity-60 cursor-not-allowed'
                }`}
                onClick={() => handleAction(ReportStatus.DRAFT)}
                disabled={!canManage || !draftIsValid || !headerIsValid}
              >
                Save Draft
              </button>
              <button
                className={`h-12 px-5 rounded-xl font-semibold text-[14px] transition-colors ${
                  publishIsValid ? 'bg-white text-[#073D44] hover:bg-white/90' : 'bg-white/70 text-[#073D44]/70 opacity-70 cursor-not-allowed'
                }`}
                onClick={() => handleAction(ReportStatus.PUBLISHED)}
                disabled={!canManage || !publishIsValid}
              >
                Publish
              </button>
            </div>
          )}
        </div>
        <div ref={firstErrorRef} />
      </div>

      {isImportFlow && !isViewMode && (
        <section className="bg-white p-6 md:p-8 rounded-[20px] border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.16em]">Import</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-slate-900 tracking-tight">Import from PPT</div>
              <div className="mt-1 text-[13px] text-slate-500">Upload a .pptx exported from this app to prefill the form.</div>
            </div>
            <div className="flex items-center gap-3">
              <input
                ref={importInputRef}
                type="file"
                accept=".ppt,.pptx"
                className="hidden"
                multiple
                onChange={(e) => handleImportFiles(e.target.files)}
              />
              <button
                type="button"
                disabled={!canManage || isImporting}
                onClick={() => importInputRef.current?.click()}
                className={`h-11 px-4 rounded-xl font-semibold text-[13px] border transition-colors ${
                  !canManage || isImporting
                    ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-[#073D44] border-[#073D44]/20 hover:bg-slate-50'
                }`}
              >
                {isImporting ? 'Extracting…' : 'Upload file'}
              </button>
            </div>
          </div>
          {importError ? (
            <div className="text-[13px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{importError}</div>
          ) : null}
          {importInfo ? (
            <div className="text-[13px] text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <div className="font-semibold text-slate-900 truncate">
                {importInfo.fileName}
              </div>
              <div className="mt-1 text-slate-600">
                Extracted: {importInfo.extractedAt} • Goals: {importInfo.goals} • Execution slides: {importInfo.executionSlides} • Threads: {importInfo.threads}
              </div>
            </div>
          ) : null}
        </section>
      )}

      <section className="bg-white p-6 md:p-8 rounded-[20px] border border-slate-200 shadow-sm space-y-6">
        <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.16em]">Report Header</h3>
        <div className={`grid grid-cols-1 ${isOverallMode ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-6`}>
          {!isOverallMode && (
            <div className="space-y-2">
              <label className="block text-[12px] font-semibold text-slate-600">Project</label>
              <ThemedSelect
                value={formData.projectId ?? ''}
                onChange={(projectId) => setFormData(prev => ({ ...prev, projectId }))}
                options={projectOptions}
                placeholder={projectOptions.length > 0 ? 'Select project/program' : 'No projects available'}
                disabled={isViewMode || projectOptions.length === 0}
                buttonClassName={headerSelectButtonClasses}
              />
            </div>
          )}
          <div className="space-y-2">
            <label className="block text-[12px] font-semibold text-slate-600">Start Date (Mon–Fri)</label>
            <DatePicker
              icon={null}
              selected={formData.startDate ? parseISODateToLocal(formData.startDate) : null}
              disabled={isViewMode}
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
                  const nextSlides = isOverallMode
                    ? (prev.executionReadinessSlides || []).map(s => ({
                        ...s,
                        sprintHealth: { ...s.sprintHealth, startDate: nextStart },
                      }))
                    : prev.executionReadinessSlides;

                  return {
                    ...prev,
                    startDate: nextStart,
                    endDate: nextEnd,
                    sprintHealth: {
                      ...(prev.sprintHealth || { startDate: nextStart, goalClarity: HealthStatus.GREEN, readiness: HealthStatus.GREEN }),
                      startDate: nextStart,
                    },
                    executionReadinessSlides: nextSlides,
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
              disabled={isViewMode}
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
          <div className="text-[12px] text-slate-500">{isViewMode ? `Updated: ${lastSavedTime}` : `Last saved: ${lastSavedTime}`}</div>
        </div>
      </section>

      <div className="space-y-8">
        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
          <div className="px-6 py-5 bg-[#CFE8E8] border-b border-[#073D44]/15">
            <div className="text-[14px] font-semibold text-[#073D44]">{reportTitle}</div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className={pageTitleOnColorClasses}>Goals &amp; Team Health</div>
              {!isViewMode && (
                <button
                  type="button"
                  onClick={addGoalRow}
                  className={headerActionButtonClasses}
                >
                  Add row
                </button>
              )}
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
                          readOnly={isViewMode}
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
                          readOnly={isViewMode}
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
                          disabled={isViewMode}
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
                          disabled={isViewMode}
                          buttonClassName={cellSelectButtonClasses}
                          getOptionDotClassName={getConfidenceDotClassName}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {!isViewMode && idx >= GOAL_ROWS && (formData.goals || []).length > GOAL_ROWS && (
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
          <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15 flex items-center justify-between">
            <div className={pageTitleOnColorClasses}>Execution Readiness &amp; Friction</div>
            {isOverallMode && !isViewMode && (
              <button
                type="button"
                onClick={addExecutionSlide}
                className="inline-flex items-center gap-2 text-[#073D44] font-bold text-[13px] hover:text-[#062F34] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>Add slide</span>
              </button>
            )}
          </div>
          <div className="p-6">
            <div className={`mt-2 grid grid-cols-1 ${isOverallMode ? '' : 'md:grid-cols-2'} gap-8`}>
              {isOverallMode ? (
                <div className="space-y-6">
                  {(formData.executionReadinessSlides || []).map((slide, slideIdx) => (
                    <div
                      key={`${slide.projectId || 'p'}-${slideIdx}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-6"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.16em]">Slide Title</div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <input
                            value={slide.projectNameOverride || ''}
                            readOnly={isViewMode}
                            onChange={(e) => updateExecutionSlide(slideIdx, { projectNameOverride: e.target.value })}
                            className={`${cellInputClasses} h-10 text-[16px] font-semibold text-[#073D44]`}
                            placeholder={projects.find(p => p.id === slide.projectId)?.name || 'Project name'}
                          />
                          <div className="text-[16px] font-semibold text-[#073D44] whitespace-nowrap">Execution Readiness &amp; Friction</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[12px] font-bold text-slate-900 tracking-tight">Slide {slideIdx + 1}</div>
                        {!isViewMode && (formData.executionReadinessSlides || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeExecutionSlide(slideIdx)}
                            className="h-9 px-3 rounded-xl bg-white border border-slate-200 text-slate-600 font-semibold text-[12px] hover:bg-slate-50 hover:text-slate-900 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div className={fieldRowClasses}>
                            <span className={fieldLabelClasses}>Project (optional)</span>
                            <ThemedSelect
                              value={slide.projectId}
                              onChange={(projectId) => updateExecutionSlide(slideIdx, { projectId })}
                              options={overallProjectOptions}
                              disabled={isViewMode}
                              buttonClassName={cellSelectButtonClasses}
                            />
                          </div>

                          <div className="space-y-3">
                            <div className={sectionTitleClasses}>Sprint Health</div>
                            <div className="space-y-3">
                              <div className={fieldRowClasses}>
                                <span className={fieldLabelClasses}>Sprint start date</span>
                                <DatePicker
                                  showIcon
                                  icon={
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                      <path
                                        d="M8 3v2M16 3v2M4 8h16M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  }
                                  selected={slide.sprintHealth?.startDate ? parseISODateToLocal(slide.sprintHealth.startDate) : null}
                                  disabled={isViewMode}
                                  onChange={(date: Date | null) => {
                                    const next = date ? formatLocalISODate(new Date(date.getFullYear(), date.getMonth(), date.getDate())) : '';
                                    updateExecutionSlide(slideIdx, { sprintHealth: { ...slide.sprintHealth, startDate: next } });
                                  }}
                                  placeholderText="dd-mm-yyyy"
                                  className={cellInputClasses}
                                  dateFormat="dd-MM-yyyy"
                                  calendarClassName="rounded-xl border border-slate-200 shadow-lg"
                                  popperClassName="z-50"
                                  wrapperClassName="w-full"
                                />
                              </div>
                              <div className={fieldRowClasses}>
                                <span className={fieldLabelClasses}>Sprint goal clarity</span>
                                <ThemedSelect
                                  value={(slide.sprintHealth?.goalClarity as any) || 'NA'}
                                  onChange={(value) => updateExecutionSlide(slideIdx, { sprintHealth: { ...slide.sprintHealth, goalClarity: value as any } })}
                                  options={healthWithNAOptions}
                                  disabled={isViewMode}
                                  buttonClassName={cellSelectButtonClasses}
                                  getOptionDotClassName={getHealthDotClassName}
                                />
                              </div>
                              <div className={fieldRowClasses}>
                                <span className={fieldLabelClasses}>Sprint readiness</span>
                                <ThemedSelect
                                  value={(slide.sprintHealth?.readiness as any) || 'NA'}
                                  onChange={(value) => updateExecutionSlide(slideIdx, { sprintHealth: { ...slide.sprintHealth, readiness: value as any } })}
                                  options={healthWithNAOptions}
                                  disabled={isViewMode}
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
                                  value={slide.capacity?.plannedHours ?? 0}
                                  readOnly={isViewMode}
                                  onChange={(e) => updateExecutionSlide(slideIdx, { capacity: { ...slide.capacity, plannedHours: Number(e.target.value) } })}
                                  className={cellInputClasses}
                                />
                              </div>
                              <div className={fieldRowClasses}>
                                <span className={fieldLabelClasses}>Committed team hours</span>
                                <input
                                  type="number"
                                  value={slide.capacity?.committedHours ?? 0}
                                  readOnly={isViewMode}
                                  onChange={(e) => updateExecutionSlide(slideIdx, { capacity: { ...slide.capacity, committedHours: Number(e.target.value) } })}
                                  className={cellInputClasses}
                                />
                              </div>
                              <div className={fieldRowClasses}>
                                <span className={fieldLabelClasses}>Surplus/Deficit (hrs)</span>
                                <input
                                  value={slide.capacity?.surplusDeficitHours ?? 0}
                                  readOnly
                                  className={`${cellInputClasses} bg-slate-50 text-slate-600`}
                                />
                              </div>
                              <div className={fieldRowClasses}>
                                <span className={fieldLabelClasses}>Load status</span>
                                <ThemedSelect
                                  value={slide.capacity?.loadStatus ?? LoadStatus.NORMAL}
                                  onChange={(value) => updateExecutionSlide(slideIdx, { capacity: { ...slide.capacity, loadStatus: value as LoadStatus } })}
                                  options={loadStatusOptions}
                                  disabled={isViewMode}
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
                                  value={slide.strength?.activeContributorNames || ''}
                                  readOnly={isViewMode}
                                  onChange={(e) => updateExecutionSlide(slideIdx, { strength: { ...slide.strength, activeContributorNames: e.target.value } })}
                                  className={cellInputClasses}
                                  placeholder="e.g., Rahul, Priya"
                                />
                              </div>
                              <div className={fieldRowClasses}>
                                <span className={fieldLabelClasses}>Critical role gaps</span>
                                <ThemedSelect
                                  value={(slide.strength?.criticalRoleGaps ?? false) ? 'YES' : 'NO'}
                                  onChange={(value) => {
                                    const nextCritical = value === 'YES';
                                    updateExecutionSlide(slideIdx, {
                                      strength: {
                                        ...slide.strength,
                                        criticalRoleGaps: nextCritical,
                                        gapNotes: nextCritical ? slide.strength?.gapNotes ?? '' : '',
                                      },
                                    });
                                  }}
                                  options={yesNoOptions}
                                  disabled={isViewMode}
                                  buttonClassName={cellSelectButtonClasses}
                                />
                              </div>
                              {(slide.strength?.criticalRoleGaps ?? false) ? (
                                <div className={fieldRowClasses}>
                                  <span className={fieldLabelClasses}>Gap notes</span>
                                  <input
                                    value={slide.strength?.gapNotes || ''}
                                    readOnly={isViewMode}
                                    onChange={(e) => updateExecutionSlide(slideIdx, { strength: { ...slide.strength, gapNotes: e.target.value } })}
                                    className={cellInputClasses}
                                    placeholder="e.g., Need 1 automation engineer"
                                  />
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="space-y-3">
                            <div className={sectionTitleClasses}>Bottlenecks (Top 3)</div>
                            <ol className="space-y-3 list-decimal ml-5">
                              {padArray(slide.bottlenecks || [], BOTTLENECK_ROWS, () => '').map((b, idx) => (
                                <li key={idx}>
                                  <div className="flex items-center gap-3">
                                    <input
                                      value={b}
                                      readOnly={isViewMode}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const next = [...padArray(slide.bottlenecks || [], BOTTLENECK_ROWS, () => '')];
                                        next[idx] = value;
                                        updateExecutionSlide(slideIdx, { bottlenecks: next });
                                      }}
                                      className={cellInputClasses}
                                      placeholder="e.g., Staging env instability"
                                    />
                                  </div>
                                </li>
                              ))}
                            </ol>
                          </div>

                          <div className="space-y-3">
                            <div className={sectionTitleClasses}>Decisions Pending (Top 3)</div>
                            <ol className="space-y-4 list-decimal ml-5">
                              {padArray(slide.decisions || [], DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' })).map((d, idx) => (
                                <li key={idx}>
                                  <div className="flex items-center gap-3">
                                    <input
                                      value={d.decisionText}
                                      readOnly={isViewMode}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const next = [...padArray(slide.decisions || [], DECISION_ROWS, () => ({ decisionText: '', ownerRole: OwnerRole.QA, dueDate: '' }))];
                                        next[idx] = { ...next[idx], decisionText: value };
                                        updateExecutionSlide(slideIdx, { decisions: next });
                                      }}
                                      className={cellInputClasses}
                                      placeholder="e.g., Approve extra test devices"
                                    />
                                  </div>
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="space-y-3">
                    <div className={sectionTitleClasses}>Sprint Health</div>
                    <div className="space-y-3">
                      <div className={fieldRowClasses}>
                        <span className={fieldLabelClasses}>Sprint start date</span>
                        <DatePicker
                          showIcon
                          icon={
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path
                                d="M8 3v2M16 3v2M4 8h16M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          }
                          selected={formData.sprintHealth?.startDate ? parseISODateToLocal(formData.sprintHealth.startDate) : null}
                          disabled={isViewMode}
                          onChange={(date: Date | null) =>
                            setFormData(prev => {
                              const next = date ? formatLocalISODate(new Date(date.getFullYear(), date.getMonth(), date.getDate())) : '';
                              return { ...prev, sprintHealth: { ...(prev.sprintHealth as any), startDate: next } };
                            })
                          }
                          placeholderText="dd-mm-yyyy"
                          className={cellInputClasses}
                          dateFormat="dd-MM-yyyy"
                          calendarClassName="rounded-xl border border-slate-200 shadow-lg"
                          popperClassName="z-50"
                          wrapperClassName="w-full"
                        />
                      </div>
                      <div className={fieldRowClasses}>
                        <span className={fieldLabelClasses}>Sprint goal clarity</span>
                        <ThemedSelect
                          value={(formData.sprintHealth?.goalClarity as any) || 'NA'}
                          onChange={(value) => setFormData(prev => ({ ...prev, sprintHealth: { ...(prev.sprintHealth as any), goalClarity: value as any } }))}
                          options={healthWithNAOptions}
                          disabled={isViewMode}
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
                          disabled={isViewMode}
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
                          readOnly={isViewMode}
                          onChange={(e) => updateCapacity({ plannedHours: Number(e.target.value) })}
                          className={cellInputClasses}
                        />
                      </div>
                      <div className={fieldRowClasses}>
                        <span className={fieldLabelClasses}>Committed team hours</span>
                        <input
                          type="number"
                          value={formData.capacity?.committedHours ?? 0}
                          readOnly={isViewMode}
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
                          disabled={isViewMode}
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
                          readOnly={isViewMode}
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
                          disabled={isViewMode}
                          buttonClassName={cellSelectButtonClasses}
                        />
                      </div>
                      {(formData.strength?.criticalRoleGaps ?? false) ? (
                        <div className={fieldRowClasses}>
                          <span className={fieldLabelClasses}>Gap notes</span>
                          <input
                            value={formData.strength?.gapNotes || ''}
                            readOnly={isViewMode}
                            onChange={(e) => setFormData(prev => ({ ...prev, strength: { ...(prev.strength as any), gapNotes: e.target.value } }))}
                            className={cellInputClasses}
                            placeholder="e.g., Need 1 automation engineer"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                </div>
              )}

              {!isOverallMode && (
              <div className="space-y-8">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className={sectionTitleClasses}>Bottlenecks (Top 3)</div>
                    {!isViewMode && (
                      <button
                        type="button"
                        onClick={addBottleneckRow}
                        className={actionButtonClasses}
                      >
                        Add row
                      </button>
                    )}
                  </div>
                  <ol className="space-y-3 list-decimal ml-5">
                    {(formData.bottlenecks || []).map((b, idx) => (
                      <li key={idx}>
                        <div className="flex items-center gap-3">
                          <input
                            value={b}
                            readOnly={isViewMode}
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
                          {!isViewMode && idx >= BOTTLENECK_ROWS && (formData.bottlenecks || []).length > BOTTLENECK_ROWS && (
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
                    {!isViewMode && (
                      <button
                        type="button"
                        onClick={addDecisionRow}
                        className={actionButtonClasses}
                      >
                        Add row
                      </button>
                    )}
                  </div>
                  <ol className="space-y-4 list-decimal ml-5">
                    {(formData.decisions || []).map((d, idx) => (
                      <li key={idx}>
                        <div className="flex items-center gap-3">
                          <input
                            value={d.decisionText}
                            readOnly={isViewMode}
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
                          {!isViewMode && idx >= DECISION_ROWS && (formData.decisions || []).length > DECISION_ROWS ? (
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
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15 flex items-center justify-between">
            <div className={pageTitleOnColorClasses}>Top Team Threads (Cognitive Load)</div>
            {!isViewMode && (
              <button
                type="button"
                onClick={addThreadRow}
                className={headerActionButtonClasses}
              >
                Add row
              </button>
            )}
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
                          readOnly={isViewMode}
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
                          readOnly={isViewMode}
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
                          disabled={isViewMode}
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
                          disabled={isViewMode}
                          buttonClassName={cellSelectButtonClasses}
                          getOptionDotClassName={getThreadStatusDotClassName}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {!isViewMode && idx >= THREAD_ROWS && (formData.threads || []).length > THREAD_ROWS && (
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
